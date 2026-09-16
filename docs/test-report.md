# 当前实现验证报告

日期：2026-09-16  
范围：Node Flow Animation 网页插件 PoC 基线（含红点流动样式）

## 已执行

在 `outputs/drawio-node-flow-web` 目录执行：

- `npm test`：8 个测试全部通过，包含红点动画、动态数量和原生菜单勾选源码校验。
- `npm run build`：成功生成 `dist/drawio-node-flow.js` 和 `dist/drawio-node-flow.min.js`。
- `node --check src/core.js`、`src/plugin.js`、两个 dist 文件：全部通过。
- 解析 `demo/mes-demo.drawio`：XML 成功解析，共 16 个 `mxCell`。

核心测试覆盖 Direct 出线过滤、自环/悬空边、Path 分支与循环去重、可见性、遍历预算、模式切换和旧效果清理。

## 尚未执行

还没有在具体的 app.diagrams.net 或自托管 draw.io 浏览器实例中执行方案文档的 P01–P09 和 F/S/I 矩阵。原因是当前工作区没有可连接的目标编辑器实例，也没有固定的自托管版本。

正式 V1 前必须在目标版本补做：SVG path 重绘、保存/自动保存、Undo/Redo、SVG/PNG/PDF 导出、Page 切换、CSP、Shift 手势、浏览器前后台切换，以及 100/500/1000 节点性能样本。若纯 view 路线无法在目标版本可靠工作，插件应提示不兼容并保持禁用，不自动改写 mxGraph model。
