//! Shared local-repository helpers over gix, used by the merge engine and
//! the fetcher. These wrap the gix equivalents of the operations the merge
//! engine needs: reference transactions (incl. compare-and-swap), revision
//! walks in the topological order git's rev-list uses, tree-to-tree diffs without rename
//! tracking, force checkouts of a tree into the working directory, and
//! workdir-to-tree comparisons for crash recovery.

use anyhow::{Context, Result};
use gix::ObjectId;
use gix::bstr::{BStr, ByteSlice};
use gix::refs::Target;
use gix::refs::transaction::{Change, LogChange, PreviousValue, RefEdit, RefLog};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

/// Open the repository at `path` (a working directory or a `.git` dir).
pub fn open(path: &Path) -> Result<gix::Repository> {
    gix::open(path).context("failed to open repository")
}

pub fn parse_oid(hex: &str) -> Result<ObjectId> {
    ObjectId::from_hex(hex.as_bytes()).with_context(|| format!("invalid object id {hex}"))
}

/// The commit HEAD ultimately points to (symbolic refs resolved).
pub fn head_oid(repo: &gix::Repository) -> Result<ObjectId> {
    Ok(repo.head_id().context("repository has no HEAD commit")?.detach())
}

/// The object `name` points to (like git's `rev-parse name`).
pub fn ref_oid(repo: &gix::Repository, name: &str) -> Result<ObjectId> {
    let mut r = repo
        .find_reference(name)
        .with_context(|| format!("reference {name} not found"))?;
    Ok(r.peel_to_id().with_context(|| format!("reference {name} has no target"))?.detach())
}

/// Direct target of a reference, if it exists and is not symbolic (same
/// semantics as a direct reference target read).
pub fn ref_target(repo: &gix::Repository, name: &str) -> Option<ObjectId> {
    repo.find_reference(name)
        .ok()
        .and_then(|r| r.target().try_id().map(|id| id.to_owned()))
}

fn full_name(name: &str) -> Result<gix::refs::FullName> {
    let name_ref: &gix::refs::FullNameRef = name
        .try_into()
        .with_context(|| format!("invalid reference name {name}"))?;
    Ok(name_ref.into())
}

/// Create or force-update `name` to `target` with a reflog message.
pub fn write_ref(repo: &gix::Repository, name: &str, target: ObjectId, log: &str) -> Result<()> {
    repo.edit_reference(RefEdit {
        change: Change::Update {
            log: LogChange {
                mode: RefLog::AndReference,
                force_create_reflog: false,
                message: log.into(),
            },
            expected: PreviousValue::Any,
            new: Target::Object(target),
        },
        name: full_name(name)?,
        deref: false,
    })
    .with_context(|| format!("failed to write {name}"))?;
    Ok(())
}

/// Update `name` to `new` only if it currently points at `expected_old`
/// (compare-and-swap, mirroring a forced reference update guarded by the expected old value).
pub fn cas_ref(
    repo: &gix::Repository,
    name: &str,
    new: ObjectId,
    expected_old: ObjectId,
    log: &str,
) -> Result<()> {
    repo.edit_reference(RefEdit {
        change: Change::Update {
            log: LogChange {
                mode: RefLog::AndReference,
                force_create_reflog: false,
                message: log.into(),
            },
            expected: PreviousValue::ExistingMustMatch(Target::Object(expected_old)),
            new: Target::Object(new),
        },
        name: full_name(name)?,
        deref: false,
    })
    .with_context(|| format!("failed to update {name}"))?;
    Ok(())
}

pub fn delete_ref(repo: &gix::Repository, name: &str) {
    if let Ok(r) = repo.find_reference(name) {
        let _ = r.delete();
    }
}

/// (skill_id-less) references under `prefix` as `(full_name, target)`.
pub fn refs_with_prefix(repo: &gix::Repository, prefix: &str) -> Vec<(String, ObjectId)> {
    let mut out = Vec::new();
    if let Ok(iter) = repo.references() {
        if let Ok(refs) = iter.prefixed(prefix) {
            for r in refs.flatten() {
                let name = r.name().as_bstr().to_string();
                if let Some(target) = r.target().try_id() {
                    out.push((name, target.to_owned()));
                }
            }
        }
    }
    out
}

/// Whether `commit` descends from `ancestor` (git's ancestry test).
/// Unrelated histories count as false.
pub fn is_descendant(repo: &gix::Repository, commit: ObjectId, ancestor: ObjectId) -> bool {
    repo.merge_base(commit, ancestor)
        .map(|base| base.detach() == ancestor)
        .unwrap_or(false)
}

/// Commit id, committer time (seconds) and parent ids of one commit.
#[derive(Debug, Clone)]
pub struct CommitNode {
    pub id: ObjectId,
    pub time: i64,
    pub parents: Vec<ObjectId>,
}

/// All commits reachable from `tip` minus those reachable from `hide`
/// (`git rev-list tip ^hide`), unordered.
fn collect_range(
    repo: &gix::Repository,
    tip: ObjectId,
    hide: Option<ObjectId>,
) -> Result<Vec<CommitNode>> {
    let mut hidden = BTreeSet::new();
    if let Some(hide) = hide {
        let walk = repo.rev_walk([hide]).all()?;
        for info in walk {
            hidden.insert(info?.id().detach());
        }
    }
    let mut out = Vec::new();
    let walk = repo.rev_walk([tip]).all()?;
    for info in walk {
        let info = info?;
        let id = info.id().detach();
        if hidden.contains(&id) {
            continue;
        }
        let commit = repo.find_commit(id)?;
        out.push(CommitNode {
            id,
            time: commit.time()?.seconds,
            parents: info.parent_ids().map(|p| p.detach()).collect(),
        });
    }
    Ok(out)
}

/// `hide..tip` in `git rev-list --topo-order` semantics: no parent is emitted
/// before any of its children, ties broken by committer time (newest first),
/// exactly like `git rev-list --topo-order`.
pub fn revwalk_topo(repo: &gix::Repository, tip: ObjectId, hide: Option<ObjectId>) -> Result<Vec<CommitNode>> {
    let nodes = collect_range(repo, tip, hide)?;
    let by_id: HashMap<ObjectId, usize> =
        nodes.iter().enumerate().map(|(i, n)| (n.id, i)).collect();
    // children[i] = indices of nodes that list nodes[i] as a parent.
    let mut children: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut unemitted_children: Vec<usize> = vec![0; nodes.len()];
    for (i, node) in nodes.iter().enumerate() {
        for p in &node.parents {
            if let Some(&pi) = by_id.get(p) {
                children.entry(pi).or_default().push(i);
                unemitted_children[pi] += 1;
            }
        }
    }
    let mut emitted = vec![false; nodes.len()];
    let mut ready: std::collections::BinaryHeap<(i64, usize)> = (0..nodes.len())
        .filter(|&i| unemitted_children[i] == 0)
        .map(|i| (nodes[i].time, i))
        .collect();
    let mut order: Vec<usize> = Vec::with_capacity(nodes.len());
    while let Some((_, i)) = ready.pop() {
        if emitted[i] {
            continue;
        }
        emitted[i] = true;
        order.push(i);
        if let Some(grandparents) = children.get(&i) {
            for &c in grandparents {
                unemitted_children[c] -= 1;
                if unemitted_children[c] == 0 {
                    ready.push((nodes[c].time, c));
                }
            }
        }
    }
    // Nodes in cycles (impossible in git) or otherwise unreached are appended
    // deterministically so nothing is silently dropped.
    for i in 0..nodes.len() {
        if !emitted[i] {
            order.push(i);
        }
    }
    Ok(order.into_iter().map(|i| nodes[i].clone()).collect())
}

/// `hide..tip` in `git rev-list --topo-order --reverse` semantics: parents
/// before children (oldest history first).
pub fn revwalk_topo_reverse(
    repo: &gix::Repository,
    tip: ObjectId,
    hide: Option<ObjectId>,
) -> Result<Vec<CommitNode>> {
    let mut nodes = revwalk_topo(repo, tip, hide)?;
    nodes.reverse();
    Ok(nodes)
}

// ── tree-to-tree diff ──

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffKind {
    Added,
    Deleted,
    Modified,
}

#[derive(Debug, Clone)]
pub struct DiffPath {
    pub kind: DiffKind,
    /// Source path for deletions and modifications (the diff's old side).
    pub old_path: Option<String>,
    /// Destination path for additions and modifications (the diff's new side).
    pub new_path: Option<String>,
}

/// Paths that differ between two trees, without rename detection (matching
/// a plain `git diff-tree` without rename detection).
pub fn tree_diff_paths(
    repo: &gix::Repository,
    old: Option<&gix::Tree>,
    new: &gix::Tree,
) -> Result<Vec<DiffPath>> {
    let empty;
    let old = match old {
        Some(t) => t,
        None => {
            empty = repo.empty_tree();
            &empty
        }
    };
    let mut out = Vec::new();
    old.changes()?
        .options(|opts| {
            opts.track_path();
            opts.track_rewrites(None);
        })
        .for_each_to_obtain_tree(new, |change| {
            use gix::object::tree::diff::Change;
            let path = |loc: &BStr| loc.to_str().ok().map(str::to_string);
            let item = match change {
                Change::Addition { location, .. } => DiffPath {
                    kind: DiffKind::Added,
                    old_path: None,
                    new_path: path(location),
                },
                Change::Deletion { location, .. } => DiffPath {
                    kind: DiffKind::Deleted,
                    old_path: path(location),
                    new_path: None,
                },
                Change::Modification { location, .. } => DiffPath {
                    kind: DiffKind::Modified,
                    old_path: path(location),
                    new_path: path(location),
                },
                Change::Rewrite {
                    source_location,
                    location,
                    ..
                } => DiffPath {
                    kind: DiffKind::Modified,
                    old_path: path(source_location),
                    new_path: path(location),
                },
            };
            out.push(item);
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })?;
    Ok(out)
}

// ── checkout ──

/// Recursive `(slash_path, mode, oid)` listing of every blob-ish leaf in
/// `tree` (files, executables, symlinks; submodule commits excluded).
pub fn tree_leaf_entries(repo: &gix::Repository, tree: &gix::Tree) -> Result<Vec<(String, u16, ObjectId)>> {
    let mut out = Vec::new();
    collect_tree_leaves(repo, tree, "", &mut out)?;
    Ok(out)
}

fn collect_tree_leaves(
    repo: &gix::Repository,
    tree: &gix::Tree,
    prefix: &str,
    out: &mut Vec<(String, u16, ObjectId)>,
) -> Result<()> {
    for entry in tree.iter() {
        let entry = entry?;
        let name = entry.filename().to_str().context("tree entry with non-utf8 name")?;
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        let mode = entry.mode();
        if mode.is_tree() {
            let sub = repo.find_tree(entry.object_id())?;
            collect_tree_leaves(repo, &sub, &path, out)?;
        } else if mode.is_blob_or_symlink() {
            out.push((path, mode.value(), entry.object_id()));
        }
    }
    Ok(())
}

/// Force-checkout `tree_oid` into the working directory and point the index
/// at it (`git read-tree --reset -u`-style force checkout):
/// - files tracked in the current index but absent from the target tree are
///   deleted (and directories left empty are pruned);
/// - every file of the target tree is (re)written through the filter
///   pipeline, overwriting local changes;
/// - untracked and ignored files are never touched.
pub fn checkout_tree_force(repo: &gix::Repository, tree_oid: ObjectId) -> Result<()> {
    let workdir = repo.workdir().context("repository has no working directory")?;

    // Baseline: the paths the current index tracks (deletions are computed
    // against it, exactly like the checkout baseline git uses).
    let old_index = repo.index_or_empty().context("failed to read index")?;
    let old_paths: BTreeSet<String> = old_index
        .entries()
        .iter()
        .map(|e| e.path(&old_index).to_str().ok().map(str::to_string))
        .collect::<Option<_>>()
        .context("index entry with non-utf8 path")?;
    drop(old_index);

    let tree = repo.find_tree(tree_oid)?;
    let new_paths: BTreeSet<String> = tree_leaf_entries(repo, &tree)?
        .into_iter()
        .map(|(p, _, _)| p)
        .collect();

    // Remove stale files first so file→dir type changes cannot collide.
    for path in old_paths.difference(&new_paths) {
        let full = workdir.join(path);
        if full.symlink_metadata().is_ok() {
            std::fs::remove_file(&full)
                .with_context(|| format!("failed to remove stale file {path}"))?;
        }
        prune_empty_parents(workdir, &full);
    }

    let mut index = repo
        .index_from_tree(&tree_oid)
        .context("failed to build index from tree")?;

    let mut opts = repo
        .checkout_options(gix::worktree::stack::state::attributes::Source::IdMapping)?;
    opts.destination_is_initially_empty = false;
    opts.overwrite_existing = true;

    let progress = gix::progress::Discard;
    let interrupt = std::sync::atomic::AtomicBool::new(false);
    gix::worktree::state::checkout(
        &mut index,
        workdir,
        repo.objects.clone().into_arc()?,
        &progress,
        &progress,
        &interrupt,
        opts,
    )
    .context("checkout failed")?;
    index.write(Default::default()).context("failed to write index")?;
    Ok(())
}

/// Remove now-empty parent directories of `file` up to (excluding) `root`.
fn prune_empty_parents(root: &Path, file: &Path) {
    let mut dir = file.parent().map(Path::to_path_buf);
    while let Some(d) = dir {
        if d == root || !d.starts_with(root) {
            break;
        }
        if std::fs::remove_dir(&d).is_err() {
            break; // not empty (e.g. ignored files) — stop here
        }
        dir = d.parent().map(Path::to_path_buf);
    }
}

// ── workdir comparison ──

/// Whether the working tree exactly matches `expected`, considering only
/// paths that occur in `expected` or `target` (a tree-to-workdir diff
/// with untracked/ignored included, filtered to the union of both trees):
/// unrelated untracked or ignored files do not count as a difference.
pub fn worktree_matches_tree(
    repo: &gix::Repository,
    expected: &gix::Tree,
    target: &gix::Tree,
) -> Result<bool> {
    let workdir = repo.workdir().context("repository has no working directory")?;
    let mut union: BTreeMap<String, Option<(u16, ObjectId)>> = BTreeMap::new();
    for (path, mode, oid) in tree_leaf_entries(repo, expected)? {
        union.insert(path, Some((mode, oid)));
    }
    for (path, _, _) in tree_leaf_entries(repo, target)? {
        union.entry(path).or_insert(None);
    }
    for (path, expected_entry) in union {
        if !workdir_path_matches(workdir, &path, expected_entry)? {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Compare one repo-relative path on disk against an optional expected entry:
/// content is compared by git blob hash, symlinks by their target.
fn workdir_path_matches(
    workdir: &Path,
    rel: &str,
    expected: Option<(u16, ObjectId)>,
) -> Result<bool> {
    let full = workdir.join(rel);
    let meta = std::fs::symlink_metadata(&full).ok();
    match (expected, meta) {
        (None, None) => Ok(true),
        (None, Some(_)) => Ok(false),
        (Some(_), None) => Ok(false),
        (Some((mode, oid)), Some(meta)) => {
            if meta.is_dir() {
                return Ok(false);
            }
            let is_link = meta.file_type().is_symlink();
            let content = if is_link {
                std::fs::read_link(&full)?
                    .as_os_str()
                    .as_encoded_bytes()
                    .to_vec()
            } else {
                std::fs::read(&full)?
            };
            let actual = gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::objs::Kind::Blob, &content)
                .context("failed to hash workdir file")?;
            if actual != oid {
                return Ok(false);
            }
            // Mode: symlink-ness must match; on unix the executable bit too.
            let expected_link = mode == 0o120000;
            if expected_link != is_link {
                return Ok(false);
            }
            #[cfg(unix)]
            if !is_link {
                use std::os::unix::fs::PermissionsExt;
                let exec = meta.permissions().mode() & 0o111 != 0;
                if (mode == 0o100755) != exec {
                    return Ok(false);
                }
            }
            Ok(true)
        }
    }
}

// ── workdir → tree (rescue commits) ──

/// Hash every non-ignored file of the working tree into a new tree, exactly
/// what `git add -A && git write-tree` would produce (ignored files and
/// `.git` excluded), for the crash-recovery rescue commit.
pub fn tree_from_workdir(repo: &gix::Repository) -> Result<BTreeMap<String, (u16, ObjectId)>> {
    let workdir = repo.workdir().context("repository has no working directory")?;
    let index = repo.index_or_empty().context("failed to read index")?;
    let options = {
        let mut opts = repo.dirwalk_options()?;
        opts.set_emit_tracked(true);
        opts
    };
    let interrupt = std::sync::atomic::AtomicBool::new(false);
    let mut collector = WorkdirCollector {
        repo,
        workdir,
        files: BTreeMap::new(),
    };
    repo.dirwalk(&index, None::<&BStr>, &interrupt, options, &mut collector)
        .context("failed to enumerate working tree")?;
    Ok(collector.files)
}

struct WorkdirCollector<'r, 'a> {
    repo: &'r gix::Repository,
    workdir: &'a Path,
    files: BTreeMap<String, (u16, ObjectId)>,
}

impl gix::dir::walk::Delegate for WorkdirCollector<'_, '_> {
    fn emit(
        &mut self,
        entry: gix::dir::EntryRef<'_>,
        _collapsed_directory_status: Option<gix::dir::entry::Status>,
    ) -> gix::dir::walk::Action {
        use gix::dir::entry;
        match entry.status {
            entry::Status::Tracked | entry::Status::Untracked => {}
            _ => return gix::dir::walk::Action::Continue(()),
        }
        let Some(disk_kind) = entry.disk_kind else {
            return gix::dir::walk::Action::Continue(());
        };
        let rel = entry.rela_path.to_string();
        let full = self.workdir.join(&rel);
        let hashed = match disk_kind {
            entry::Kind::File => hash_file_entry(self.repo, &full, false),
            entry::Kind::Symlink => hash_file_entry(self.repo, &full, true),
            _ => Ok(None),
        };
        match hashed {
            Ok(Some(item)) => {
                self.files.insert(rel, item);
            }
            Ok(None) => {}
            Err(e) => {
                log::warn!("workdir tree: skipping {}: {e:#}", full.display());
            }
        }
        gix::dir::walk::Action::Continue(())
    }
}

fn hash_file_entry(
    repo: &gix::Repository,
    full: &Path,
    is_link: bool,
) -> Result<Option<(u16, ObjectId)>> {
    if is_link {
        let target = std::fs::read_link(full)?;
        let oid = repo.write_blob(target.as_os_str().as_encoded_bytes())?;
        return Ok(Some((0o120000, oid.detach())));
    }
    let meta = std::fs::symlink_metadata(full)?;
    if !meta.is_file() {
        return Ok(None);
    }
    let content = std::fs::read(full)?;
    let oid = repo.write_blob(&content)?;
    let mut mode = 0o100644u16;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o111 != 0 {
            mode = 0o100755;
        }
    }
    Ok(Some((mode, oid.detach())))
}

// ── signatures ──

/// The committer identity from git configuration, or the app fallback —
/// same identity resolution the previous engine used: git config, then the app fallback.
pub fn signature_or_fallback(repo: &gix::Repository) -> gix::actor::Signature {
    let configured = repo
        .committer()
        .and_then(Result::ok)
        .and_then(|sig| sig.to_owned().ok());
    match configured {
        Some(sig) => sig,
        None => gix::actor::Signature {
            name: "SkillHarbor".into(),
            email: "skillharbor@local".into(),
            time: gix::date::Time::now_local_or_utc(),
        },
    }
}
