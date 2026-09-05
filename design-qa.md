# OpenDesign 源码设计映射验收

日期：2026-09-05。方法：参考项目 `skills/impeccable-design-polish/SKILL.md` 的 audit / critique / polish / harden 流程。先定 `DESIGN.md`，再修改应用。

## 设计依据

参考根目录 `/Users/xbjt/Documents/myself/open-design`。实际 token、shell、entry-layout、primitives、settings 与 app-wash 的路径列在 `DESIGN.md`。最新源码是白色画布、中性灰、44px 顶栏、236px 可折叠侧栏，与此前会话截图的灰绿首页不同；本轮以用户指定的源码为准。

保留原目标：全局统一维护技能 → 中文用法/原文 → 项目软链接。没有采用参考产品的创作输入框、作品封面或品牌标识。使用真实技能文本、现有图标、Albert Sans + 中文系统字体；授权文件随仓库保存。

## 审核与修复

- 旧首页的巨大搜索区域、灰绿 token 和胶囊堆叠妨碍直接浏览技能：替换为紧凑工具栏、真实技能网格/列表；删除旧 opendesign.css，新增单一 design-system.css。
- 页面壳层不统一：统一顶部导航、可折叠侧栏、内容宽度、按钮、表单、详情对话框，覆盖项目、市场和旧维护页面。
- 设置页面过长：改为本地执行、工具与目录、外观与偏好、同步与更新、关于与诊断五组，切换保持输入状态。
- 首次实际截图发现 macOS 原生 select 只有约18px高：参考源码 primitives 的 appearance 处理，统一36px控件和箭头。重新打包后的实际截图确认与搜索框对齐。
- 对话框使用原生 dialog，提供标题、关闭按钮、Escape、焦点约束；选框和视图切换带可访问名称，异步链接结果有状态播报，保留 reduced-motion 样式。

## 实际验收

使用 macOS 原生 Tauri debug 应用，数据隔离于 `/tmp/skillharbor-e2e/home`。CUA截图在本会话内，未另存本地图片。截图为1286×768原生窗口输出，不宣称等于CSS视口像素，也不宣称像素级复制参考项目。

1. 本地路径导入第二个 readme-check 技能；全局库显示2个真实技能。
2. 切换网格/列表、多选全选/取消；重启后列表与侧栏偏好保持。
3. 搜索不存在关键词显示空状态，清除筛选恢复2个技能。
4. project-note 详情默认中文说明；切换原文成功，Escape关闭。
5. 批量选择2个技能并链接到 demo-project，界面逐项显示成功。文件系统 `ls -l` 确认 `.codex/skills/project-note` 与 `readme-check` 均为指向全局库的符号链接。
6. 项目引用页显示demo-project已有2个技能；市场浏览与本地导入正常。
7. 设置本地执行和外观分类正常切换；实际截图检查深色主题，恢复浅色。
8. 最新debug构建重启后检查全局列表，筛选控件高度修复生效，内容无可见裁切。

## 验证范围

TypeScript/Vite构建、ESLint通过。本轮没有修改后端行为，原后端和CLI验收见 WORKBENCH-VERIFICATION.md。Vite提示现有主包超过500kB，为后续拆包项，不影响本地打包。没有逐一验证所有窗口尺寸、Windows/Linux、全部市场仓库及全部设置动作；不宣称这些场景已通过。

结论：本轮核心流程和已检查的桌面视觉状态通过。

## 全局鼠标动效与规约迁移补充

保留 OpenDesign craft 全部规则及应用 tokens、材质、壳层、共享控件、设置和点阵源实现，哈希清单见 docs/design/upstream/manifest.json。docs/design/README.md 提供本项目执行规则、映射和差异，根 AGENTS.md 要求后续前端修改先查规约。来源快照未作为运行时代码导入，旧页面控件未逐一迁移的范围明确记录。

公共 Layout 挂载一个 PointerKineticGrid，所有注册路由共享；背景不接收指针事件。使用源项目点距、作用半径和弹簧阻尼；增加静止和隐藏暂停、实时 reduced-motion 响应。实际 Tauri 截图检查全局库与市场页，点阵背景均显示，路由链接正常点击。系统减少动态效果切换与各窗口尺寸未逐一实机验收。构建与lint通过，日志 /tmp/skill-ripple-debug.log、/tmp/skill-ripple-lint.log。

## 基于原文规则的整站重设计验收

本轮使用根及src/AGENTS.md的真实规则，主要改动从公共层进入页面，而非叠加全页样式：PageHeader/Button、DetailSheet和ToggleSwitch；页面和组件独有样式采用CSS Modules。维护、备份、市场、项目详情、项目列表、全局技能、设置、工具目录及项目高级管理标题体系统一。

实际 macOS Tauri 隔离数据验收：
- 捕获并检查全局库、项目列表、项目详情、市场、维护、备份、工具目录、设置页面；主要内容、操作及路径没有可见横向裁切。
- 中文说明正常显示；从详情打开链接弹窗，执行 project-note 到demo-project，显示软链接已就绪；完成及Escape返回正常。
- 深色设置页面检查标题、选中态、开关；恢复浅色。
- 侧栏展开/收起、导航高亮正常；隐藏导航有inert和aria-hidden。
- 新版项目向导打开正常，空路径时创建动作禁用；表单可滚动。
- 第一轮弹窗截图发现macOS select回退原生矮控件，修复共享选择器范围；第二轮截图确认36px高度及紧凑链接弹窗生效。补充提高背景箭头选择器优先级，避免被局部background重置。

TypeScript/Vite、ESLint、git diff --check通过。最终debug及release构建日志：/tmp/workbench-system-debug.log、/tmp/workbench-system-release.log；lint日志：/tmp/workbench-system-lint.log。原生截图展示于本会话，未另存图片。

未执行真实Git克隆/恢复、全局批量启用、删除与每个弹窗的提交；没有为视觉验收改动用户真实技能数据。项目高级管理及部分辅助弹窗做了代码/类型检查，没有逐一实机截图。未覆盖全部窗口尺寸和Windows/Linux。本轮后端无新增修改，原有CLI端到端记录仍属于之前验收。

最终debug重启后再次截图链接表单，确认两个选择框的统一高度和下拉箭头均生效。

## 2026-09-05 独立索引管理

- 新增 `/search-index`，侧栏、首页“管理索引”和快捷查找提供入口；首页移除构建操作和高级索引详情。
- 复用 PageHeader、Button、Disclosure、LoadingState 及全局动效，局部 CSS Module；新增应用级共享索引状态，导航不取消构建。
- npm run lint、npm run build 通过。隔离 debug 桌面应用实测：首页进入索引页，触发真实更新，看到构建中及禁用状态；返回首页，再由侧栏进入后显示 3 个文件就绪与本次完成时间。实际截图检查页面布局正常。
- 后端检索算法未修改，本次未重复模型下载或故障注入，失败状态依据现有 API 错误回传。
