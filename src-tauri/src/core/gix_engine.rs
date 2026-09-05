//! gix-based network engine for the backup remote (backup redesign §3.3,
//! Phase 2 pilot).
//!
//! Scope is deliberately narrow: fetch, ls-remote and clone against http(s)
//! remotes go through gix, with credentials injected in-memory from the OS
//! keychain. Push has no gix equivalent (gix 0.87 implements no send-pack),
//! so it goes through system git with the same in-memory credential
//! injection (askpass) — the system-git engine path authenticates exactly
//! the same way. All local operations (commit, tag, status, merge,
//! read-tree) stay on system git, and SSH / custom remotes always use
//! system git. Opt-in via the `git_backup_engine` setting; default is the
//! system git engine.
//!
//! Error normalization matters here: the frontend maps error text produced
//! by system git ("Authentication failed", "Could not resolve host",
//! "non-fast-forward", …) to plain-language copy. gix phrases the same
//! failures differently, so every error leaving this module is prefixed
//! with the equivalent system-git marker.

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use super::git_credentials;
use super::gix_repo;

static PILOT_ENABLED: AtomicBool = AtomicBool::new(false);
static PROXY_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

/// Sync the engine preference from settings. Called at the entry of backup
/// commands (core code has no store access).
pub fn set_preference(gix_enabled: bool, proxy_url: Option<String>) {
    PILOT_ENABLED.store(gix_enabled, Ordering::Relaxed);
    *PROXY_URL
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = proxy_url.filter(|s| !s.is_empty());
}

fn proxy_url() -> Option<String> {
    PROXY_URL
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Whether the gix engine should handle operations against `url`.
pub fn applies_to(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    PILOT_ENABLED.load(Ordering::Relaxed)
        && (lower.starts_with("https://") || lower.starts_with("http://"))
}

/// Create a `Command` for git that hides the console window on Windows.
fn git_command() -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new("git");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Credentials callback resolving against the OS keychain (same lookup the
/// system-git engine performs via askpass). The transport re-invokes the
/// callback after a rejection; without a cap that loops forever on a bad
/// token, mirroring the old C-binding callback's attempt limit.
fn credentials_for(
    url: &str,
) -> impl FnMut(gix::credentials::helper::Action) -> gix::credentials::protocol::Result + 'static {
    let cred = git_credentials::https_host(url)
        .and_then(|host| git_credentials::load_credential(&host).ok().flatten());
    let mut attempts = 0;
    move |action| {
        use gix::credentials::helper::{Action, NextAction};
        use gix::credentials::protocol::Outcome;
        match action {
            Action::Get(ctx) => {
                attempts += 1;
                if attempts > 2 {
                    return Ok(None);
                }
                let (username, password) = match &cred {
                    Some(c) => (c.username.clone(), c.password.clone()),
                    // No stored credential: try the URL's own username (if
                    // any) with an empty password rather than prompting.
                    None => (ctx.username.clone().unwrap_or_default(), String::new()),
                };
                Ok(Some(Outcome {
                    identity: gix::sec::identity::Account {
                        username,
                        password,
                        oauth_refresh_token: None,
                    },
                    next: NextAction::from(ctx),
                }))
            }
            // The keychain write path is owned by the credential-migration
            // flow, not by fetch-time callbacks.
            Action::Store(_) | Action::Erase(_) => Ok(None),
        }
    }
}

/// Route gix network operations through the configured proxy, in-memory
/// only (the repo's on-disk config is never touched). When no app proxy is
/// set, gix reads `http.proxy` from the repo's own git configuration — the
/// same auto-detection the previous engine performed.
fn apply_proxy_config(repo: &mut gix::Repository) -> Result<()> {
    if let Some(proxy) = proxy_url() {
        repo.config_snapshot_mut()
            .append_config([format!("http.proxy={proxy}")], gix::config::Source::Api)?;
    }
    Ok(())
}

/// Translate a gix error into the marker vocabulary the frontend's git
/// error mapping already understands.
fn normalize_err(e: anyhow::Error, operation: &str) -> anyhow::Error {
    let msg = format!("{e:#}");
    let lower = msg.to_ascii_lowercase();
    let marker = if lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
        || lower.contains("credentials")
    {
        "Authentication failed"
    } else if lower.contains("non-fast-forward") || lower.contains("non fast forward") {
        "non-fast-forward"
    } else if lower.contains("resolve")
        || lower.contains("connect")
        || lower.contains("timed out")
        || lower.contains("timeout")
    {
        "Failed to connect"
    } else if lower.contains("tls") || lower.contains("ssl") || lower.contains("certificate") {
        "TLS/SSL error"
    } else {
        ""
    };
    if marker.is_empty() {
        anyhow::anyhow!("gix {operation} failed: {msg}")
    } else {
        anyhow::anyhow!("gix {operation} failed: {marker}: {msg}")
    }
}

/// Fetch `branch` (or the remote's configured refspecs when `None`) from
/// origin, updating the usual remote-tracking refs.
pub fn fetch(repo_dir: &Path, branch: Option<&str>, url: &str) -> Result<()> {
    let mut repo = gix_repo::open(repo_dir).context("Failed to open repository")?;
    apply_proxy_config(&mut repo)?;
    let remote = repo.find_remote("origin").context("No origin remote")?;
    let mut conn = remote
        .connect(gix::remote::Direction::Fetch)
        .map_err(|e| normalize_err(e.into(), "fetch"))?;
    conn.set_credentials(credentials_for(url));

    let mut options = gix::remote::ref_map::Options::default();
    if let Some(b) = branch {
        options.extra_refspecs.push(
            gix::refspec::parse(
                format!("+refs/heads/{b}:refs/remotes/origin/{b}").as_str().into(),
                gix::refspec::parse::Operation::Fetch,
            )
            .context("failed to build fetch refspec")?
            .into(),
        );
    }
    let prepare = conn
        .prepare_fetch(gix::progress::Discard, options)
        .map_err(|e| normalize_err(e.into(), "fetch"))?;
    prepare
        .receive(gix::progress::Discard, &AtomicBool::new(false))
        .map_err(|e| normalize_err(e.into(), "fetch"))?;
    log::info!("gix fetch: done ({})", branch.unwrap_or("configured refspecs"));
    Ok(())
}

/// Push the given refspecs to origin via system git (gix 0.87 has no push
/// support). Credentials come from the same keychain askpass injection the
/// system-git engine uses; per-reference rejections (the non-fast-forward
/// case) surface with system git's own vocabulary.
pub fn push_refs(repo_dir: &Path, refspecs: &[String], url: &str) -> Result<()> {
    let env = git_credentials::credential_env_for_url(url);
    let mut cmd = git_command();
    cmd.arg("-C").arg(repo_dir).arg("push");
    if let Some(proxy) = proxy_url() {
        cmd.arg("-c").arg(format!("http.proxy={proxy}"));
    }
    cmd.arg("origin").args(refspecs);
    cmd.envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())));
    cmd.stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());

    let output = cmd.output().context("Failed to run git push")?;
    if output.status.success() {
        log::info!("gix push: pushed {} refspec(s)", refspecs.len());
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = super::git_backup::redact_urls_in_text(stderr.trim());
    let lower = detail.to_ascii_lowercase();
    if lower.contains("non-fast-forward") || lower.contains("rejected") {
        // Same vocabulary as system git so the UI routes to recovery.
        anyhow::bail!("gix push failed: non-fast-forward, failed to push some refs ({detail})");
    }
    Err(normalize_err(
        anyhow::anyhow!("git push exited with {}: {detail}", output.status),
        "push",
    ))
}

/// List remote ref names (heads and tags) for `url` without a local repo.
pub fn ls_remote_refs(url: &str) -> Result<Vec<String>> {
    // A gix remote is always tied to a repository; a scratch bare one
    // carries the (in-memory) proxy and credential configuration.
    let scratch = tempfile::tempdir().context("Failed to create scratch repo")?;
    let mut repo = gix::init_bare(scratch.path()).context("Failed to init scratch repo")?;
    apply_proxy_config(&mut repo)?;
    let remote = repo
        .remote_at(url)
        .context("Failed to create detached remote")?;
    let mut conn = remote
        .connect(gix::remote::Direction::Fetch)
        .map_err(|e| normalize_err(e.into(), "ls-remote"))?;
    conn.set_credentials(credentials_for(url));
    // The anonymous remote's only refspec is the implicit tag spec; left as
    // a server-side filter it would hide all heads, so list everything.
    let options = gix::remote::ref_map::Options {
        prefix_from_spec_as_filter_on_remote: false,
        ..Default::default()
    };
    let (ref_map, _handshake) = conn
        .ref_map(gix::progress::Discard, options)
        .map_err(|e| normalize_err(e.into(), "ls-remote"))?;
    let names = ref_map
        .remote_refs
        .iter()
        .map(|r| r.unpack().0.to_string())
        .collect();
    Ok(names)
}

/// Full clone (backup needs complete history — no shallow).
pub fn clone(url: &str, dest: &Path) -> Result<()> {
    let mut prep = gix::prepare_clone(url, dest).map_err(|e| normalize_err(e.into(), "clone"))?;
    if let Some(proxy) = proxy_url() {
        prep = prep.with_in_memory_config_overrides([format!("http.proxy={proxy}")]);
    }
    let url_owned = url.to_string();
    prep = prep.configure_connection(move |conn| {
        conn.set_credentials(credentials_for(&url_owned));
        Ok(())
    });
    let (mut checkout, _fetch) = prep
        .fetch_then_checkout(gix::progress::Discard, &AtomicBool::new(false))
        .map_err(|e| normalize_err(e.into(), "clone"))?;
    checkout
        .main_worktree(gix::progress::Discard, &AtomicBool::new(false))
        .map_err(|e| normalize_err(e.into(), "clone"))?;
    log::info!("gix clone: done");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// Platform-correct file URL: Windows paths need forward slashes and a
    /// third slash before the drive letter (`file:///C:/...`).
    fn file_url(path: &Path) -> String {
        let s = path.display().to_string().replace('\\', "/");
        if s.starts_with('/') {
            format!("file://{s}")
        } else {
            format!("file:///{s}")
        }
    }

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args([
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
            ])
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    #[test]
    fn applies_to_requires_flag_and_https() {
        // Default off: nothing routes to the gix engine.
        assert!(!applies_to("https://github.com/a/b.git"));
        PILOT_ENABLED.store(true, Ordering::Relaxed);
        assert!(applies_to("https://github.com/a/b.git"));
        assert!(applies_to("HTTP://example.com/a/b.git"));
        assert!(!applies_to("git@github.com:a/b.git"));
        assert!(!applies_to("ssh://git@github.com/a/b.git"));
        assert!(!applies_to("/local/path"));
        PILOT_ENABLED.store(false, Ordering::Relaxed);
    }

    #[test]
    fn push_fetch_ls_remote_roundtrip_against_local_remote() {
        let tmp = tempfile::tempdir().unwrap();
        let remote = tmp.path().join("remote.git");
        let work = tmp.path().join("work");
        std::fs::create_dir_all(&work).unwrap();
        assert!(Command::new("git")
            .args(["init", "--bare", "--initial-branch=main"])
            .arg(&remote)
            .output()
            .unwrap()
            .status
            .success());
        let url = file_url(&remote);

        git(&work, &["init", "-b", "main"]);
        git(&work, &["remote", "add", "origin", &url]);
        std::fs::write(work.join("a.txt"), "v1").unwrap();
        git(&work, &["add", "-A"]);
        git(&work, &["commit", "-m", "v1"]);
        git(&work, &["tag", "sm-v-20260101-000000-abc"]);

        // Push branch + tag through the engine.
        push_refs(
            &work,
            &[
                "refs/heads/main:refs/heads/main".to_string(),
                "refs/tags/sm-v-20260101-000000-abc:refs/tags/sm-v-20260101-000000-abc"
                    .to_string(),
            ],
            &url,
        )
        .unwrap();

        // Remote now lists both refs.
        let refs = ls_remote_refs(&url).unwrap();
        assert!(refs.iter().any(|r| r == "refs/heads/main"), "{refs:?}");
        assert!(
            refs.iter()
                .any(|r| r == "refs/tags/sm-v-20260101-000000-abc"),
            "{refs:?}"
        );

        // The engine's push updated the local remote-tracking ref (parity
        // with system git — ahead/behind and upstream health depend on it).
        let out = Command::new("git")
            .arg("-C")
            .arg(&work)
            .args(["rev-parse", "refs/remotes/origin/main"])
            .output()
            .unwrap();
        assert!(out.status.success(), "tracking ref missing after engine push");

        // Fetch through the engine from a second clone after a new remote commit.
        let other = tmp.path().join("other");
        clone(&url, &other).unwrap();
        std::fs::write(other.join("b.txt"), "from other").unwrap();
        git(&other, &["add", "-A"]);
        git(&other, &["commit", "-m", "v2"]);
        push_refs(&other, &["refs/heads/main:refs/heads/main".to_string()], &url).unwrap();

        fetch(&work, Some("main"), &url).unwrap();
        let out = Command::new("git")
            .arg("-C")
            .arg(&work)
            .args(["rev-list", "--count", "main..origin/main"])
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8_lossy(&out.stdout).trim(),
            "1",
            "fetch should see the new remote commit"
        );
    }

    #[test]
    fn push_rejection_reports_non_fast_forward_vocabulary() {
        let tmp = tempfile::tempdir().unwrap();
        let remote = tmp.path().join("remote.git");
        let a = tmp.path().join("a");
        let b = tmp.path().join("b");
        std::fs::create_dir_all(&a).unwrap();
        assert!(Command::new("git")
            .args(["init", "--bare", "--initial-branch=main"])
            .arg(&remote)
            .output()
            .unwrap()
            .status
            .success());
        let url = file_url(&remote);

        git(&a, &["init", "-b", "main"]);
        git(&a, &["remote", "add", "origin", &url]);
        std::fs::write(a.join("f.txt"), "base").unwrap();
        git(&a, &["add", "-A"]);
        git(&a, &["commit", "-m", "base"]);
        git(&a, &["push", "origin", "main"]);

        clone(&url, &b).unwrap();

        // Diverge: A pushes a new commit, B commits without pulling.
        std::fs::write(a.join("f.txt"), "from a").unwrap();
        git(&a, &["commit", "-am", "a2"]);
        git(&a, &["push", "origin", "main"]);
        std::fs::write(b.join("f.txt"), "from b").unwrap();
        git(&b, &["commit", "-am", "b2"]);

        let err = push_refs(&b, &["refs/heads/main:refs/heads/main".to_string()], &url)
            .unwrap_err();
        let msg = format!("{err:#}").to_ascii_lowercase();
        assert!(
            msg.contains("non-fast-forward") || msg.contains("fast-forward"),
            "frontend error mapping relies on this vocabulary, got: {msg}"
        );
    }
}
