const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDirect, resolvePath, createController, normalizeSettings, STYLE_PRESETS } = require('../src/core');

const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'bd', source: 'b', target: 'd' },
  { id: 'ce', source: 'c', target: 'e' },
  { id: 'de', source: 'd', target: 'e' },
  { id: 'eb', source: 'e', target: 'b' },
  { id: 'bb', source: 'b', target: 'b' },
  { id: 'dangling', source: 'b', target: null }
];

test('Direct resolves only outgoing edges and keeps parallel/self-loop edges', () => {
  const result = resolveDirect('b', edges);
  assert.deepEqual(result.map(e => e.id), ['bc', 'bd', 'bb', 'dangling']);
  assert.equal(result.some(e => e.id === 'ab'), false);
});

test('Path resolves reachable directed edges once and terminates cycles', () => {
  const result = resolvePath('b', edges);
  assert.deepEqual(new Set(result.map(e => e.id)), new Set(['bc', 'bd', 'ce', 'de', 'eb', 'bb', 'dangling']));
});

test('Path honours visibility and budget without returning a partial success', () => {
  const hidden = [{ id: 'hidden', source: 'b', target: 'x', visible: false }];
  assert.deepEqual(resolvePath('b', edges.concat(hidden)), resolvePath('b', edges));
  assert.throws(() => resolvePath('b', edges, { maxEdges: 2 }), /budget/i);
});

test('controller switches mode and clears stale generations', () => {
  const applied = [];
  const cleared = [];
  const c = createController({
    getEdges: () => edges,
    apply: (cells, mode) => applied.push([cells.map(e => e.id), mode]),
    clear: reason => cleared.push(reason)
  });
  c.activate('b', 'direct');
  c.activate('c', 'path');
  assert.deepEqual(applied[0], [['bc', 'bd', 'bb', 'dangling'], 'direct']);
  assert.equal(applied[1][1], 'path');
  assert.deepEqual(new Set(applied[1][0]), new Set(['ce', 'de', 'eb', 'bc', 'bd', 'bb', 'dangling']));
  assert.deepEqual(cleared, ['replace']);
  c.clear('blank');
  assert.deepEqual(cleared, ['replace', 'blank']);
});

test('settings normalize supported style, direction and speed choices', () => {
  assert.deepEqual(normalizeSettings({ style: 'dots', direction: 'reverse', speed: 300 }), {
    style: 'dots', direction: 'reverse', speed: 300
  });
  assert.deepEqual(normalizeSettings({ style: 'unknown', direction: 'bad', speed: 9999 }), {
    style: 'dash', direction: 'normal', speed: 600
  });
  assert.equal(STYLE_PRESETS.pulse.dash, '14 8');
  assert.equal(STYLE_PRESETS.particles.dash, null);
});
