# 模态调用方与公共状态反馈复查

2026-09-05 静态检查。本轮不操作用户数据，不代表实机动效已通过。

## 已修复

- CloseActionDialog、HelpDialog 移除仅由 open 决定的 early return，始终把 open 交给 DetailSheet，取消和父级关闭可走公共退出生命周期。
- 此前负责的 CreatePresetDialog、RenamePresetDialog、TagRenameDialog、BatchTagDialog 已相同处理；PresetManager 及内部创建/修改/确认常驻挂载。
- StatusBanner 改用独立 CSS Module 和共享 Button；移除浅主题下固定浅红/浅黄文字及黑色半透明按钮。中性面板、危险语义图标、换行内容及小窗口换行操作区统一消费 token。
- StatusBanner 的 Promise 操作加即时 ref 锁、busy、失败行内提示。调用者必须返回 Promise；`onAction={() => void task()}` 无法让组件追踪异步周期。
- Button 的 secondary 变体补实际 CSS 类；减少动态效果下关闭按压 translate，而非仅去掉 transition。

## 检查范围与交接

- GitSetupDialog、GitRecoveryDialog、FirstRunRestoreDialog、ConfirmDialog、AddProjectDialog：读取时已把 open 传给 DetailSheet，不含简单 `!open return null`。
- AddSkillsSheet：读取时仍有外层 `if (!props.open) return null`；交给项目域负责人，不能机械去除其内部数据初始化语义。
- SkillDetailPanel：`if (!skill) return null` 属于业务实体条件，交给维护域决定保留上一实体直到退出。
- GlobalSkills 的 SkillLinkDialog 与选中详情属于条件挂载，交给主代理；不擅自修改其实体状态。
- ProjectDetail 的 `if (!project) return null` 是页面业务条件，不属于模态 open 修复。
- CommandPalette、Sidebar 不在本轮编辑范围。

## 本域验证

定向 ESLint 与 `npx tsc -b` 通过。实际仍需隔离验收：帮助与关闭询问各自 X/Escape/取消，市场与全局数据错误两处状态反馈，Promise 重试按钮双击锁与错误保留，亮暗/窄窗口及减少动态效果。源码存在或编译通过不能替代这些交互验收。
