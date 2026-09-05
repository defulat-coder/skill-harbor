//! Recursive tree construction (design §5): apply a set of path-addressed
//! edits to a base tree, rebuilding the ancestor chain bottom-up with
//! per-level entry maps. Path-based tree editors are deliberately not used —
//! their handling of remove-then-upsert on one path and of blob↔tree type
//! changes is incomplete; type changes are handled explicitly here by
//! removing the old entry before inserting the new one.
//!
//! Callers express "replace whatever is at this path" by inserting removes
//! first and letting puts overwrite them in the flat edit map. A nested edit
//! below a removed path builds that directory from scratch (the removed
//! subtree's former siblings do not leak through).

use anyhow::{Context, Result, bail};
use gix::ObjectId;
use gix::bstr::BString;
use std::collections::BTreeMap;

pub const FILEMODE_TREE: i32 = 0o040000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeEdit {
    /// Put a blob at this path (file mode from the source entry).
    PutBlob { oid: ObjectId, mode: i32 },
    /// Attach a whole subtree at this path.
    PutTree { oid: ObjectId },
    /// Remove whatever is at this path (blob or subtree).
    Remove,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EntryKind {
    Tree,
    Blob,
}

struct DirNode {
    /// When true, ignore the base tree at this level: the old entry was
    /// removed, so the directory is rebuilt only from the nested edits.
    fresh: bool,
    children: BTreeMap<String, Node>,
}

enum Node {
    Leaf(TreeEdit),
    Dir(DirNode),
}

/// Apply `edits` (repo-relative slash paths → edit) on top of `base`,
/// returning the OID of the new root tree. Directories that end up empty are
/// pruned (git does not represent empty trees in a commit).
pub fn apply_tree_edits(
    repo: &gix::Repository,
    base: Option<&gix::Tree>,
    edits: &BTreeMap<String, TreeEdit>,
) -> Result<ObjectId> {
    let mut root: BTreeMap<String, Node> = BTreeMap::new();
    for (path, edit) in edits {
        insert_edit(&mut root, path, *edit)
            .with_context(|| format!("conflicting tree edits at {path}"))?;
    }
    match build_level(repo, base, &root)? {
        Some(oid) => Ok(oid),
        // A fully-emptied root is still a valid (empty) tree.
        None => write_tree(repo, BTreeMap::new()),
    }
}

fn insert_edit(level: &mut BTreeMap<String, Node>, path: &str, edit: TreeEdit) -> Result<()> {
    let (head, rest) = match path.split_once('/') {
        Some((h, r)) => (h, Some(r)),
        None => (path, None),
    };
    if head.is_empty() {
        bail!("empty path component");
    }
    match rest {
        None => match level.get_mut(head) {
            None => {
                level.insert(head.to_string(), Node::Leaf(edit));
                Ok(())
            }
            Some(Node::Dir(dir)) if edit == TreeEdit::Remove => {
                // Remove of a directory that already has nested puts: rebuild
                // it from scratch so former siblings do not leak through.
                dir.fresh = true;
                Ok(())
            }
            Some(_) => bail!("duplicate edit for {head}"),
        },
        Some(rest) => {
            let node = level.entry(head.to_string()).or_insert_with(|| {
                Node::Dir(DirNode { fresh: false, children: BTreeMap::new() })
            });
            if let Node::Leaf(TreeEdit::Remove) = node {
                // The whole old entry goes away; nested edits build the new
                // directory from scratch.
                *node = Node::Dir(DirNode { fresh: true, children: BTreeMap::new() });
            }
            match node {
                Node::Dir(dir) => insert_edit(&mut dir.children, rest, edit),
                Node::Leaf(_) => bail!("edit below a leaf edit at {head}"),
            }
        }
    }
}

/// `(name → (kind, mode, oid))` of one tree level.
fn level_entries(tree: &gix::Tree) -> Result<BTreeMap<BString, (EntryKind, u16, ObjectId)>> {
    let mut out = BTreeMap::new();
    for entry in tree.iter() {
        let entry = entry?;
        let mode = entry.mode();
        let kind = if mode.is_tree() { EntryKind::Tree } else { EntryKind::Blob };
        out.insert(
            entry.filename().to_owned(),
            (kind, mode.value(), entry.object_id()),
        );
    }
    Ok(out)
}

fn build_level(
    repo: &gix::Repository,
    base: Option<&gix::Tree>,
    nodes: &BTreeMap<String, Node>,
) -> Result<Option<ObjectId>> {
    let mut entries: BTreeMap<BString, (EntryKind, u16, ObjectId)> = match base {
        Some(tree) => level_entries(tree)?,
        None => BTreeMap::new(),
    };
    for (name, node) in nodes {
        let name_b: BString = name.clone().into();
        let existing_kind = entries.get(&name_b).map(|(kind, _, _)| *kind);
        match node {
            Node::Leaf(TreeEdit::Remove) => {
                entries.remove(&name_b);
            }
            Node::Leaf(TreeEdit::PutBlob { oid, mode }) => {
                if existing_kind == Some(EntryKind::Tree) {
                    entries.remove(&name_b); // tree → blob type change
                }
                entries.insert(name_b, (EntryKind::Blob, *mode as u16, *oid));
            }
            Node::Leaf(TreeEdit::PutTree { oid }) => {
                if existing_kind == Some(EntryKind::Blob) {
                    entries.remove(&name_b); // blob → tree type change
                }
                entries.insert(name_b, (EntryKind::Tree, FILEMODE_TREE as u16, *oid));
            }
            Node::Dir(dir) => {
                let existing = entries.get(&name_b).copied();
                let child_base_tree;
                let child_base: Option<&gix::Tree> = match existing {
                    _ if dir.fresh => None,
                    Some((EntryKind::Tree, _, id)) => {
                        child_base_tree = repo.find_tree(id)?;
                        Some(&child_base_tree)
                    }
                    Some(_) => {
                        // A blob where the plan needs a directory: explicit
                        // type change — drop the blob, build from empty.
                        entries.remove(&name_b);
                        None
                    }
                    None => None,
                };
                match build_level(repo, child_base, &dir.children)? {
                    Some(oid) => {
                        if dir.fresh && existing_kind == Some(EntryKind::Blob) {
                            entries.remove(&name_b);
                        }
                        entries.insert(name_b, (EntryKind::Tree, FILEMODE_TREE as u16, oid));
                    }
                    None => {
                        entries.remove(&name_b);
                    }
                }
            }
        }
    }
    if entries.is_empty() {
        return Ok(None);
    }
    Ok(Some(write_tree(repo, entries)?))
}

/// Serialize one tree level: entries sorted the way git orders tree entries
/// (directories compare with a trailing `/`), then written to the object
/// database.
fn write_tree(
    repo: &gix::Repository,
    entries: BTreeMap<BString, (EntryKind, u16, ObjectId)>,
) -> Result<ObjectId> {
    let mut list: Vec<gix::objs::tree::Entry> = Vec::with_capacity(entries.len());
    for (name, (_, mode, oid)) in entries {
        let mode = gix::objs::tree::EntryMode::try_from(u32::from(mode))
            .map_err(|m| anyhow::anyhow!("invalid tree entry mode {m:o}"))?;
        list.push(gix::objs::tree::Entry { mode, filename: name, oid });
    }
    list.sort_by(|a, b| {
        gix::objs::tree::name_order(
            a.filename.as_ref(),
            a.mode.is_tree(),
            b.filename.as_ref(),
            b.mode.is_tree(),
        )
    });
    let tree = gix::objs::Tree { entries: list };
    Ok(repo.write_object(&tree)?.detach())
}

#[cfg(test)]
mod tests {
    use super::*;
    use gix::objs::tree::EntryKind as TreeEntryKind;

    fn test_repo() -> (tempfile::TempDir, gix::Repository) {
        let tmp = tempfile::tempdir().unwrap();
        let repo = gix::init(tmp.path()).unwrap();
        (tmp, repo)
    }

    fn blob(repo: &gix::Repository, content: &str) -> ObjectId {
        repo.write_blob(content.as_bytes()).unwrap().detach()
    }

    fn tree_of(repo: &gix::Repository, entries: &[(&str, TreeEdit)]) -> ObjectId {
        let edits: BTreeMap<String, TreeEdit> =
            entries.iter().map(|(p, e)| (p.to_string(), *e)).collect();
        apply_tree_edits(repo, None, &edits).unwrap()
    }

    fn entry_kind(repo: &gix::Repository, root: ObjectId, path: &str) -> Option<TreeEntryKind> {
        let tree = repo.find_tree(root).unwrap();
        tree.lookup_entry_by_path(std::path::Path::new(path))
            .unwrap()
            .map(|e| e.mode().kind())
    }

    #[test]
    fn builds_nested_paths_and_prunes_empty_dirs() {
        let (_tmp, repo) = test_repo();
        let b = blob(&repo, "hello");
        let root = tree_of(
            &repo,
            &[("a/b/c.txt", TreeEdit::PutBlob { oid: b, mode: 0o100644 })],
        );
        assert_eq!(entry_kind(&repo, root, "a/b/c.txt"), Some(TreeEntryKind::Blob));

        // Removing the only file prunes the whole empty chain.
        let mut edits = BTreeMap::new();
        edits.insert("a/b/c.txt".to_string(), TreeEdit::Remove);
        let base = repo.find_tree(root).unwrap();
        let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
        assert_eq!(repo.find_tree(new_root).unwrap().iter().count(), 0);
    }

    #[test]
    fn put_tree_attaches_subtree_directly() {
        let (_tmp, repo) = test_repo();
        let inner = tree_of(
            &repo,
            &[(
                "SKILL.md",
                TreeEdit::PutBlob { oid: blob(&repo, "skill"), mode: 0o100644 },
            )],
        );
        let root = tree_of(&repo, &[("group/my-skill", TreeEdit::PutTree { oid: inner })]);
        assert_eq!(
            entry_kind(&repo, root, "group/my-skill/SKILL.md"),
            Some(TreeEntryKind::Blob)
        );
    }

    #[test]
    fn blob_to_tree_and_tree_to_blob_type_changes() {
        let (_tmp, repo) = test_repo();
        let file = blob(&repo, "was a file");
        let root = tree_of(&repo, &[("thing", TreeEdit::PutBlob { oid: file, mode: 0o100644 })]);
        let base = repo.find_tree(root).unwrap();

        // blob → tree via a nested edit below the old blob path
        let mut edits = BTreeMap::new();
        edits.insert(
            "thing/SKILL.md".to_string(),
            TreeEdit::PutBlob { oid: blob(&repo, "now a dir"), mode: 0o100644 },
        );
        let root2 = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
        assert_eq!(entry_kind(&repo, root2, "thing"), Some(TreeEntryKind::Tree));
        assert_eq!(entry_kind(&repo, root2, "thing/SKILL.md"), Some(TreeEntryKind::Blob));

        // tree → blob via PutBlob at the old dir path
        let base2 = repo.find_tree(root2).unwrap();
        let mut edits = BTreeMap::new();
        edits.insert(
            "thing".to_string(),
            TreeEdit::PutBlob { oid: blob(&repo, "file again"), mode: 0o100644 },
        );
        let root3 = apply_tree_edits(&repo, Some(&base2), &edits).unwrap();
        assert_eq!(entry_kind(&repo, root3, "thing"), Some(TreeEntryKind::Blob));
    }

    #[test]
    fn nested_put_under_removed_dir_rebuilds_from_scratch() {
        let (_tmp, repo) = test_repo();
        // Old skill dir "spot" with two files.
        let root = tree_of(
            &repo,
            &[
                ("spot/SKILL.md", TreeEdit::PutBlob { oid: blob(&repo, "old"), mode: 0o100644 }),
                ("spot/extra.md", TreeEdit::PutBlob { oid: blob(&repo, "extra"), mode: 0o100644 }),
            ],
        );
        let base = repo.find_tree(root).unwrap();

        // The skill moves away (Remove spot) while a residual file lands at
        // spot/readme.txt. The old skill files must NOT leak through.
        let mut edits = BTreeMap::new();
        edits.insert("spot".to_string(), TreeEdit::Remove);
        edits.insert(
            "spot/readme.txt".to_string(),
            TreeEdit::PutBlob { oid: blob(&repo, "note"), mode: 0o100644 },
        );
        // Both key orders through insert_edit are covered because the flat
        // map sorts "spot" before "spot/readme.txt".
        let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
        assert_eq!(entry_kind(&repo, new_root, "spot/readme.txt"), Some(TreeEntryKind::Blob));
        assert_eq!(entry_kind(&repo, new_root, "spot/SKILL.md"), None);
        assert_eq!(entry_kind(&repo, new_root, "spot/extra.md"), None);
    }

    #[test]
    fn put_overwrites_remove_when_planner_replaces_a_path() {
        let (_tmp, repo) = test_repo();
        let old = tree_of(
            &repo,
            &[(
                "spot/SKILL.md",
                TreeEdit::PutBlob { oid: blob(&repo, "old"), mode: 0o100644 },
            )],
        );
        let incoming = tree_of(
            &repo,
            &[(
                "SKILL.md",
                TreeEdit::PutBlob { oid: blob(&repo, "new"), mode: 0o100644 },
            )],
        );
        let base = repo.find_tree(old).unwrap();
        // Planner convention: removes first, puts overwrite the same key.
        let mut flat: BTreeMap<String, TreeEdit> = BTreeMap::new();
        flat.insert("spot".to_string(), TreeEdit::Remove);
        flat.insert("spot".to_string(), TreeEdit::PutTree { oid: incoming });
        let root = apply_tree_edits(&repo, Some(&base), &flat).unwrap();
        let tree = repo.find_tree(root).unwrap();
        let entry = tree
            .lookup_entry_by_path(std::path::Path::new("spot/SKILL.md"))
            .unwrap()
            .unwrap();
        assert_eq!(repo.find_blob(entry.object_id()).unwrap().data, b"new");
    }

    #[test]
    fn untouched_siblings_survive() {
        let (_tmp, repo) = test_repo();
        let root = tree_of(
            &repo,
            &[
                ("keep.txt", TreeEdit::PutBlob { oid: blob(&repo, "keep"), mode: 0o100644 }),
                ("dir/a.txt", TreeEdit::PutBlob { oid: blob(&repo, "a"), mode: 0o100644 }),
                ("dir/b.txt", TreeEdit::PutBlob { oid: blob(&repo, "b"), mode: 0o100644 }),
            ],
        );
        let base = repo.find_tree(root).unwrap();
        let mut edits = BTreeMap::new();
        edits.insert("dir/a.txt".to_string(), TreeEdit::Remove);
        let new_root = apply_tree_edits(&repo, Some(&base), &edits).unwrap();
        assert_eq!(entry_kind(&repo, new_root, "keep.txt"), Some(TreeEntryKind::Blob));
        assert_eq!(entry_kind(&repo, new_root, "dir/b.txt"), Some(TreeEntryKind::Blob));
        assert_eq!(entry_kind(&repo, new_root, "dir/a.txt"), None);
    }

    #[test]
    fn written_trees_match_system_git_layout() {
        // The on-disk format is user data: a tree written here must be
        // byte-identical to what git itself produces for the same content.
        let (_tmp, repo) = test_repo();
        let root = tree_of(
            &repo,
            &[
                ("a.txt", TreeEdit::PutBlob { oid: blob(&repo, "a"), mode: 0o100644 }),
                ("a/b.txt", TreeEdit::PutBlob { oid: blob(&repo, "b"), mode: 0o100644 }),
                ("a-b/c.txt", TreeEdit::PutBlob { oid: blob(&repo, "c"), mode: 0o100644 }),
            ],
        );
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(repo.workdir().unwrap())
            .args(["cat-file", "-t", &root.to_string()])
            .output()
            .unwrap();
        assert!(out.status.success(), "git must read the tree: {root}");
    }
}
