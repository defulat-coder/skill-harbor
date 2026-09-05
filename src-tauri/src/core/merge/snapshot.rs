//! Read one commit's tree into the logical objects the merge operates on
//! (design §1/§2): skills (metadata + content-tree fingerprint), scenarios,
//! memberships, residual files, and the schema/protocol markers.

use anyhow::{Context, Result, bail};
use gix::ObjectId;
use gix::bstr::ByteSlice;
use gix::objs::tree::EntryKind;
use std::collections::{BTreeMap, BTreeSet};

use super::protocol::ProtocolFile;
use crate::core::sync_metadata::SkillMetaFile;

pub const METADATA_DIR: &str = ".skillharbor";
/// Pre-rebrand name of the metadata namespace. Trees committed before the
/// rename still carry it: reads fall back to it, writes never use it.
pub const LEGACY_METADATA_DIR: &str = ".skills-manager";
/// Marker files that make a directory a valid skill dir (mirrors
/// `skill_metadata::SKILL_DIR_MARKERS` for tree-level checks).
pub const SKILL_DIR_MARKERS: &[&str] = &["SKILL.md", "skill.md"];
/// Maximum depth (in path components) of a skill content directory.
pub const MAX_SKILL_DEPTH: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileEntry {
    pub oid: ObjectId,
    pub mode: i32,
}

#[derive(Debug, Clone)]
pub struct SkillObj {
    pub meta: SkillMetaFile,
    /// The raw `skills/{id}.json` blob this metadata was read from, so the
    /// planner can tell whether a rebuilt blob actually differs.
    pub meta_entry: FileEntry,
    /// Tree OID of the content directory at `meta.path`; `None` when the
    /// path is missing from the tree (a broken pairing the validator rejects
    /// in any *merged* tree, but which inputs may exhibit).
    pub content: Option<ObjectId>,
}

/// Component-level equality (§2): `content` / `path` / `attrs` are compared
/// independently.
pub fn attrs_eq(a: &SkillMetaFile, b: &SkillMetaFile) -> bool {
    a.enabled == b.enabled && a.tags == b.tags && a.source == b.source
}

pub fn skill_identical(a: &SkillObj, b: &SkillObj) -> bool {
    a.content == b.content && a.meta.path == b.meta.path && attrs_eq(&a.meta, &b.meta)
}

#[derive(Debug, Default)]
pub struct Snapshot {
    pub skills: BTreeMap<String, SkillObj>,
    /// scenario_id → scenarios/{id}.json blob
    pub scenarios: BTreeMap<String, FileEntry>,
    /// (scenario_id, skill_id) → scenario-skills/{sid}/{skid}.json blob
    pub memberships: BTreeMap<(String, String), FileEntry>,
    /// Repo-relative path → blob, for every file outside claimed content
    /// dirs and outside the known metadata files (`.gitignore`, stray user
    /// files, unknown future `.skillharbor` entries).
    pub residual: BTreeMap<String, FileEntry>,
    pub schema: Option<(FileEntry, u64)>,
    pub protocol: Option<(FileEntry, ProtocolFile)>,
    /// True when the metadata namespace was found under its pre-rebrand name
    /// ([`LEGACY_METADATA_DIR`]): the merge rebuilds it under [`METADATA_DIR`]
    /// and drops the legacy tree.
    pub legacy_metadata_dir: bool,
}

pub fn read_snapshot(repo: &gix::Repository, tree: &gix::Tree) -> Result<Snapshot> {
    let mut snap = Snapshot::default();

    // ── metadata namespace ──
    let meta_entry = tree
        .find_entry(METADATA_DIR)
        .or_else(|| tree.find_entry(LEGACY_METADATA_DIR));
    if let Some(meta_entry) = meta_entry {
        let meta_dir = meta_entry.filename().to_str().unwrap_or(METADATA_DIR).to_string();
        snap.legacy_metadata_dir = meta_dir == LEGACY_METADATA_DIR;
        let meta_tree = repo
            .find_tree(meta_entry.object_id())
            .with_context(|| format!("{meta_dir} is not a directory"))?;
        for entry in meta_tree.iter() {
            let entry = entry?;
            let name = entry.filename().to_str().unwrap_or_default().to_string();
            let mode = entry.mode();
            match (name.as_str(), mode.kind()) {
                ("skills", EntryKind::Tree) => {
                    let skills_tree = repo.find_tree(entry.object_id())?;
                    for e in skills_tree.iter() {
                        let e = e?;
                        let file = e.filename().to_str().unwrap_or_default().to_string();
                        let Some(stem) = file.strip_suffix(".json") else {
                            record_residual(
                                &mut snap,
                                format!("{meta_dir}/skills/{file}"),
                                e.mode(),
                                e.object_id(),
                            );
                            continue;
                        };
                        let blob = repo
                            .find_blob(e.object_id())
                            .with_context(|| format!("skill metadata {file} is not a blob"))?;
                        let meta: SkillMetaFile = serde_json::from_slice(&blob.data)
                            .with_context(|| format!("invalid skill metadata {file}"))?;
                        if meta.skill_id != stem {
                            bail!(
                                "skill metadata {file}: skill_id {} does not match file name",
                                meta.skill_id
                            );
                        }
                        let content = tree
                            .lookup_entry_by_path(std::path::Path::new(&meta.path))
                            .ok()
                            .flatten()
                            .filter(|e| e.mode().is_tree())
                            .map(|e| e.object_id());
                        snap.skills.insert(
                            stem.to_string(),
                            SkillObj {
                                meta,
                                meta_entry: FileEntry {
                                    oid: e.object_id(),
                                    mode: i32::from(e.mode().value()),
                                },
                                content,
                            },
                        );
                    }
                }
                ("scenarios", EntryKind::Tree) => {
                    let t = repo.find_tree(entry.object_id())?;
                    for e in t.iter() {
                        let e = e?;
                        let file = e.filename().to_str().unwrap_or_default().to_string();
                        match file.strip_suffix(".json") {
                            Some(stem) if e.mode().kind() == EntryKind::Blob => {
                                snap.scenarios.insert(
                                    stem.to_string(),
                                    FileEntry {
                                        oid: e.object_id(),
                                        mode: i32::from(e.mode().value()),
                                    },
                                );
                            }
                            _ => record_residual(
                                &mut snap,
                                format!("{meta_dir}/scenarios/{file}"),
                                e.mode(),
                                e.object_id(),
                            ),
                        }
                    }
                }
                ("scenario-skills", EntryKind::Tree) => {
                    let t = repo.find_tree(entry.object_id())?;
                    for dir in t.iter() {
                        let dir = dir?;
                        let sid = dir.filename().to_str().unwrap_or_default().to_string();
                        if dir.mode().kind() != EntryKind::Tree {
                            record_residual(
                                &mut snap,
                                format!("{meta_dir}/scenario-skills/{sid}"),
                                dir.mode(),
                                dir.object_id(),
                            );
                            continue;
                        }
                        let dt = repo.find_tree(dir.object_id())?;
                        for e in dt.iter() {
                            let e = e?;
                            let file = e.filename().to_str().unwrap_or_default().to_string();
                            match file.strip_suffix(".json") {
                                Some(stem) if e.mode().kind() == EntryKind::Blob => {
                                    snap.memberships.insert(
                                        (sid.clone(), stem.to_string()),
                                        FileEntry {
                                            oid: e.object_id(),
                                            mode: i32::from(e.mode().value()),
                                        },
                                    );
                                }
                                _ => record_residual(
                                    &mut snap,
                                    format!("{meta_dir}/scenario-skills/{sid}/{file}"),
                                    e.mode(),
                                    e.object_id(),
                                ),
                            }
                        }
                    }
                }
                ("schema.json", EntryKind::Blob) => {
                    let blob = repo.find_blob(entry.object_id())?;
                    let version = serde_json::from_slice::<serde_json::Value>(&blob.data)
                        .ok()
                        .and_then(|v| v.get("schema_version").and_then(|n| n.as_u64()))
                        .unwrap_or(0);
                    snap.schema = Some((
                        FileEntry {
                            oid: entry.object_id(),
                            mode: i32::from(entry.mode().value()),
                        },
                        version,
                    ));
                }
                ("protocol.json", EntryKind::Blob) => {
                    let blob = repo.find_blob(entry.object_id())?;
                    let parsed: ProtocolFile =
                        serde_json::from_slice(&blob.data).context("invalid protocol.json")?;
                    snap.protocol = Some((
                        FileEntry {
                            oid: entry.object_id(),
                            mode: i32::from(entry.mode().value()),
                        },
                        parsed,
                    ));
                }
                _ => {
                    record_residual(&mut snap, format!("{meta_dir}/{name}"), mode, entry.object_id());
                }
            }
        }
    }

    // ── residual walk: everything outside claimed content dirs ──
    let claimed: BTreeSet<String> =
        snap.skills.values().map(|s| s.meta.path.clone()).collect();
    collect_residual(repo, tree, "", &claimed, &mut snap.residual)?;

    Ok(snap)
}

/// Record a metadata-namespace entry we don't own as residual so it still
/// merges (whole-file) instead of being silently dropped. Directories are
/// flattened to their files.
fn record_residual(
    snap: &mut Snapshot,
    path: String,
    mode: gix::objs::tree::EntryMode,
    oid: ObjectId,
) {
    if mode.kind() == EntryKind::Blob {
        snap.residual.insert(
            path,
            FileEntry { oid, mode: i32::from(mode.value()) },
        );
    }
    // Unknown subtrees under the metadata dir are intentionally not descended:
    // nothing writes them today, and treating them as opaque would need
    // whole-tree semantics we don't have. The validator does not reject them.
}

fn collect_residual(
    repo: &gix::Repository,
    tree: &gix::Tree,
    prefix: &str,
    claimed: &BTreeSet<String>,
    out: &mut BTreeMap<String, FileEntry>,
) -> Result<()> {
    for entry in tree.iter() {
        let entry = entry?;
        let name = entry.filename().to_str().unwrap_or_default();
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        if prefix.is_empty() && (name == METADATA_DIR || name == LEGACY_METADATA_DIR) {
            continue; // handled by the metadata reader
        }
        let mode = entry.mode();
        match mode.kind() {
            EntryKind::Tree => {
                if claimed.contains(&path) {
                    continue; // skill content, merged as one subtree
                }
                let sub = repo.find_tree(entry.object_id())?;
                collect_residual(repo, &sub, &path, claimed, out)?;
            }
            EntryKind::Blob => {
                out.insert(
                    path,
                    FileEntry {
                        oid: entry.object_id(),
                        mode: i32::from(mode.value()),
                    },
                );
            }
            _ => {} // commits (submodules) etc. — not supported, ignored
        }
    }
    Ok(())
}

/// Whether a tree (a directory) is a valid skill dir: directly contains one
/// of the marker files as a blob.
pub fn tree_is_valid_skill_dir(tree: &gix::Tree) -> bool {
    SKILL_DIR_MARKERS.iter().any(|marker| {
        tree.find_entry(*marker)
            .map(|e| e.mode().kind() == EntryKind::Blob)
            .unwrap_or(false)
    })
}
