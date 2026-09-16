const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('plugin carries its own moving dash keyframes for Desktop environments', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8');
  assert.match(source, /@keyframes nodeFlowDash/);
  assert.match(source, /nodeFlowAnimation/);
  assert.match(source, /animationDuration/);
});

test('plugin defines a line-preserving red particle animation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8');
  assert.match(source, /attachParticles|node-flow-particle/);
  assert.match(source, /animateMotion/);
  assert.match(source, /#e53935|red/i);
  assert.match(source, /settings\.speed \* 2/);
  assert.match(source, /Math\.round\(length \/ 100\)/);
  assert.match(source, /Math\.max\(2, Math\.min\(12/);
  assert.match(source, /particleDuration\(path\)/);
  assert.match(source, /length \/ 100/);
});

test('plugin marks the active configuration in the extras menu', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8');
  assert.match(source, /setToggleAction\(true\)/);
  assert.match(source, /setSelectedCallback\(function \(\) \{ return settings\.style === entry\[1\]; \}\)/);
  assert.match(source, /setSelectedCallback\(function \(\) \{ return settings\.direction === entry\[1\]; \}\)/);
  assert.match(source, /setSelectedCallback\(function \(\) \{ return settings\.speed === entry\[1\]; \}\)/);
});
