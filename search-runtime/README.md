# Local skill search runtime

Node.js >=22. Production dependency is pinned `@zvec/zvec-grep@0.2.1` (Apache-2.0).

Install in this directory with `npm ci --ignore-scripts --no-audit --no-fund`. Keep optional dependencies: the native Zvec package is required. Do **not** use `--omit=optional`. Ignoring lifecycle scripts avoids the optional `node-llama-cpp` postinstall; the selected multilingual embedding uses Transformers/ONNX, not llama.cpp. This exact installation was tested on Node 24 / macOS arm64. Other OS/architectures need their own native installation.

Run `node search-runtime/search.mjs`, write exactly one JSON object to stdin, then close stdin:

```json
{"op":"query","root":"/absolute/central/skills","cacheDir":"/absolute/local-workbench/search/root-hash","query":"设计漂亮的网页界面"}
```

Operations: `status`, `index`, `query`. Final stdout line is `{ "ok": true, "result": ... }` or `{ "ok": false, "error": "..." }`. Diagnostics go to stderr. The Rust caller should tolerate native output and parse the final JSON line. Success exits 0; caught errors exit 1. Close the service and allow natural exit: forced `process.exit()` was observed to race native destructors and abort with exit 134.

- status/index result: `root, available, ready, model, files, error?`.
- query result: `query, hits[{path,line_start,line_end,text,score}], warning?`. Paths are absolute **original source** paths, line numbers come from the Zvec text range. Scores are rank-fusion scores, not calibrated relevance probabilities.
- Only non-hidden, non-symlink `.md`/`.mdx` files <=1 MiB are mirrored. `node_modules` is skipped. No content is uploaded for embedding.
- Native `context({query,autoUpdate:true})` performs actual indexed hybrid retrieval. Errors are not relabelled keyword-search successes.

## Storage caveat confirmed from upstream

In 0.2.1 `createZvecGrep({home})` does **not** relocate workspace indexes: `workspaceHome(root)` is always `root/.zvec-grep`. Therefore this adapter creates a restricted Markdown mirror in `cacheDir/workspace`, invokes the unmodified official API with that root, and maps hits to the original central root. Source skill files are never changed. The cache binds to one canonical source root; the caller should additionally hash that root into the cache path.

Unchanged mirror contents retain their mtimes. Deleted source documents are removed from the mirror. Updated documents are copied before native auto-update. Index storage is `cacheDir/workspace/.zvec-grep`; model files live in `cacheDir/models`, outside skill backup.

Local model: `local/multilingual-e5-small`, pinned upstream model revision, q8, CPU. First use downloads model artifacts from Hugging Face (about 144 MiB cache observed); subsequent queries run local inference. Production node_modules measured about 537 MiB on this machine, including optional native packages. No global npm install or user zg configuration changes are needed.

## Verification

`node search-runtime/smoke.mjs` uses only `/tmp/skills-zvec-smoke` fixture files and cache. It checks two Chinese-to-English retrieval examples, unchanged mirror mtime, source addition/modification/deletion automatic update, hidden/oversize/symlink exclusion, and no `.zvec-grep` creation in the source. Real native/model smoke completed successfully; evidence was written to `/tmp/skills-zvec-smoke/smoke-results.json`. The first model load requires network access for model downloads only.

The current macOS app bundle requires macOS 13.5 or later: the bundled Node 24 executable declares 13.5 and ONNX declares 13.3 (verified with `vtool -show-build`). Local app builds use ad-hoc signing; no Developer ID notarization is claimed. The Node distribution license is copied beside its bundled executable.
