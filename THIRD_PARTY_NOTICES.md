# Third-party notices

## Open Design

The visual design is derived from the local Open Design reference project (`nexu-io/open-design`). The native-select appearance rules in `src/design-system.css` are adapted from its `apps/web/src/styles/primitives.css`, with selectors changed for this application. The Apache License 2.0 is included in `licenses/OpenDesign-Apache-2.0.txt`.

## Albert Sans

`public/fonts/AlbertSans-VariableFont_wght.ttf` is Albert Sans, obtained from the reference project's bundled font. Copyright 2021 The Albert Sans Project Authors. It is distributed under the SIL Open Font License 1.1; see `public/fonts/AlbertSans-OFL.txt`.

`src/components/PointerKineticGrid.tsx` adapts Open Design’s `AppWashKineticGrid.tsx` under Apache-2.0. Changes extend the background to all routes, stop rendering when settled/hidden, cap pixel density, and follow live reduced-motion preferences.

`docs/design/upstream/` preserves unmodified reference documents, styles and component sources from Open Design, identified by manifest.json. Its craft documents retain their original Refero Design / MIT attribution. These are reference snapshots, not runtime modules.

## Local search

The bundled local search runtime uses `@zvec/zvec-grep@0.2.1` and Zvec under Apache-2.0. Their license files and dependency notices are retained in the bundled `search-runtime/node_modules` tree. Sources: https://github.com/zvec-ai/zvec-grep and https://github.com/alibaba/zvec.

The runtime includes the build host's Node.js executable. The selected `multilingual-e5-small` embedding model is downloaded on first indexing into the application cache; model files are not included in the application bundle.
