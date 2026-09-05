# OpenDesign 自身界面开发规则（原文摘录）

以下三个章节逐字摘自参考仓库根 AGENTS.md；没有把本项目的新建议混入原文。完整文件与哈希在 upstream/。原文里的目录及命令属于 OpenDesign，适用于本项目的路径映射见 src/AGENTS.md。

## Web CSS ownership

- `apps/web/src/index.css` is an import-only cascade entrypoint. Do not add selectors or declarations there; add imports only when a truly global stylesheet is needed, and keep import order intentional.
- Shared global styles belong in `apps/web/src/styles/`: design tokens, base/reset rules, primitives, app-shell layout, and legacy cross-component selectors that cannot safely be scoped yet. Keep domain-level global files grouped by owner (for example `styles/viewer/` and `styles/workspace/`) instead of adding more large files directly under `styles/`.
- New component-owned UI styles should default to CSS Modules next to the component (`Component.module.css`) instead of expanding global stylesheets. This is preferred for isolated components, panels, menus, drawers, toolbars, cards, and form sections.
- When touching an existing component with nearby global styles, prefer migrating that component's local selectors to a CSS Module as part of the change if it is small and testable. Do not mix a large mechanical move with behavior/styling changes in the same patch.
- Keep global class names only for deliberate shared contracts: reusable primitives, theme hooks, third-party/content styling, cross-component layout, or selectors that rely on global cascade/specificity. Document any new global selector group with its owning feature.
- CSS refactors must preserve cascade semantics. For mechanical splits, verify expanded import content/order matches the previous stylesheet; for CSS Module migrations, validate the affected UI path with `pnpm --filter @open-design/web typecheck` and a focused build/test or visual check when practical.

## Web component reuse

- New `apps/web` UI should reuse shared primitives from `@open-design/components` when one exists instead of styling plain HTML elements directly. For example, use `Button` for app buttons and `VisuallyHidden` for screen-reader-only text/status content.
- Do not add new raw primitive classes such as `primary`, `primary-ghost`, `ghost`, `subtle`, `icon-btn`, or `sr-only` for new UI. Those classes are legacy compatibility surface for existing markup until it is migrated.
- If a needed primitive is missing, prefer adding a small focused primitive to `packages/components` with colocated CSS Modules, then consume it from the app. Keep product-specific layout and workflow styling in the app, not in `packages/components`.
- Keep semantic plain HTML when it is content markup or a specialized control that the shared package does not model yet; do not force a migration that would hide native behavior or make a custom widget harder to reason about.
- `apps/web` transpiles `@open-design/components` from source during dev, so component and CSS Module edits should work through the normal web dev loop without rebuilding the package.

## UI animation philosophy

- Default ease-out for UI transitions: `cubic-bezier(0.23, 1, 0.32, 1)`. Built-in `ease` is too weak; `ease-in` is forbidden for UI elements because it feels sluggish.
- Asymmetric durations: enter around 200ms, exit around 140ms. Exit reads as decisive because the user has already chosen to dismiss.
- Accordion expand and collapse uses `grid-template-rows: 0fr -> 1fr` (modern auto height pattern). Pair with opacity fade and the easing above. The shared `.accordion-collapsible` + `.accordion-collapsible-inner` class pair (defined in `apps/web/src/index.css`) is the canonical implementation; reuse it for new disclosure UI.
- Never animate from `transform: scale(0)`. Start from `scale(0.9)` or higher with `opacity: 0`.
- For elements that show conditionally, keep them mounted and toggle a CSS class (e.g. `.chat-jump-btn-active`). React unmounts skip the exit transition entirely.
