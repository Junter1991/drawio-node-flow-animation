# 网页版安装与验证

## 自托管网页（推荐）

1. 固定 draw.io 网页版本，并将 `dist/drawio-node-flow.js` 放到该版本允许的同源插件目录。
2. 按该版本的插件注册方式配置入口；插件入口必须在 `Draw.loadPlugin` 可用的时机执行。
3. 清缓存刷新一次，再用正常缓存刷新一次。
4. 打开 `demo/mes-demo.drawio`：普通点击节点测试 Direct，按住 Shift 点击节点测试 Path。
5. 在 `其它 → Node Flow Animation` 中选择“动画样式：红点流动”，确认连接线保持原样且有 4 个红色小圆点沿线循环运动；方向和速度设置仍然有效。
6. 按方案文档中的 P02/P03/P06/P07 检查 model、dirty、Undo/Redo、保存和导出。

## 公共 app.diagrams.net

公共站点对外部自定义插件的入口和 CSP 可能有限制。只有在实际环境验证脚本被执行、刷新可复现、保存与导出安全后，才能把该环境列为支持环境。不要把 `?p=node-flow` 当作任意外部脚本的安装方式，除非该 ID 已由宿主注册。

## CSP 检查

脚本响应必须是 JavaScript MIME，不能被登录页或错误页替代。检查 `script-src`/`script-src-elem`、nonce/hash、`style-src` 以及 HTTPS 混合内容限制。插件不需要外部网络请求，不应通过 `eval`、`new Function`、通配来源或关闭浏览器安全策略绕过 CSP。

## 卸载与回滚

移除注册项并刷新页面；插件会清理 view path class、事件监听和重绘包装。回滚到上一个固定版本后，重新清缓存并执行 Direct/Path 冒烟测试。
