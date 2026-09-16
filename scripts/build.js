const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
const plugin = fs.readFileSync(path.join(root, 'src/plugin.js'), 'utf8');
// Keep the source modules readable; the distributable bundles the browser global core and plugin.
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const variants = [
  ['auto', '__NODE_FLOW_LANGUAGE__'],
  ['zh', 'zh'],
  ['en', 'en']
];
variants.forEach(([name, mode]) => {
  const bundle = core + '\n' + plugin.replace(/__NODE_FLOW_LANGUAGE__/g, mode);
  fs.writeFileSync(path.join(root, `dist/drawio-node-flow-${name}.js`), bundle, 'utf8');
  fs.writeFileSync(path.join(root, `dist/drawio-node-flow-${name}.min.js`), bundle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' '), 'utf8');
});
// Keep the auto-detect build as the default filename for existing installations.
fs.copyFileSync(path.join(root, 'dist/drawio-node-flow-auto.js'), path.join(root, 'dist/drawio-node-flow.js'));
fs.copyFileSync(path.join(root, 'dist/drawio-node-flow-auto.min.js'), path.join(root, 'dist/drawio-node-flow.min.js'));
