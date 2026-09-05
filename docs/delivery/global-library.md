# 全局技能库最后审查

范围：GlobalSkills、其中文/原文详情、SkillLinkDialog；补查AddSkillsSheet受控关闭。依据根/src AGENTS、DESIGN与已迁入OpenDesign规则，复用PageHeader/Button/DetailSheet/Disclosure/LoadingState，未修改共享实现或后端。

| 操作/状态 | 实修或保留 | 验证边界 |
|---|---|---|
| 全局列表读取 | LoadingState提供等待与15秒慢反馈；appError且库为空时显示读取失败入口，不再显示“添加第一个技能” | 静态审查；根Layout仍负责具体错误信息 |
| 搜索/标签/来源/排序 | 原组合筛选和排序保留，补真实source_type import/skillssh中文名称 | 未新写入技能数据 |
| 网格/列表 | 保留localStorage与pressed，原卡片数据布局保留 | 构建检查 |
| 单选/多选/当前结果全选 | 原生input.indeterminate与aria-checked=mixed；只计算当前筛选结果，跨筛选已选保留 | 需原生验证半选符号与VoiceOver播报 |
| 批量链接入口 | 仅传当前仍存在的已选技能；全局→项目软链接模式保留 | 静态接口检查 |
| URL技能详情 | 保留?skill打开/关闭；URL已存在时点击另一技能同步目标，避免继续读取旧URL技能 | 需路由运行验证 |
| 中文/原文详情 | 默认中文，原文LoadingState、失败重试保留；来源折叠改共享Disclosure | 需慢请求及减少动画实测 |
| 链接目标切换 | 更换项目/工具同时清空旧结果和错误；忙碌时不能切换 | 静态状态流检查 |
| 链接提交 | useRef同步防重入，Button/选择器忙碌禁用；固定symlink参数 | 需隔离目录实际创建与同名冲突验证 |
| 部分成功/失败 | 保存成功结果；再次提交只选择没有成功结果的技能；行内逐项状态保留 | 需故障注入验证部分失败再重试 |
| 全部成功 | 提交动作禁用并显示全部已链接，保留完成按钮 | 静态状态流检查 |
| 关闭/完成按钮 | 向所属原生dialog发送cancel请求，进入共享DetailSheet dismiss流程，避免父级直接卸载跳过退出；未添加timer | 需原生WKWebView验证cancel派发与退出 |
| 无项目 | 新建/导入项目导航保留 | 导航本身会卸载路由，不声明有跨路由退出动效 |
| AddSkillsSheet受控退出 | 移除open=false提前return，始终挂载并传open给DetailSheet，使父级关闭完成140ms退出；关闭后保留筛选草稿和未完成选择 | 需工具/项目调用处实测重新打开 |

验证：GlobalSkills、SkillLinkDialog、AddSkillsSheet定向ESLint与`npx tsc -b`均退出0，差异空白检查通过；共享组件之后的修改由主任务合并验证；未使用用户真实技能目录或执行项目写入。以上“需”项是待主任务运行验证，不因源码存在而视为已通过。
