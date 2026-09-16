(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NodeFlowCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function edgeVisible(edge) { return edge && edge.visible !== false; }

  var STYLE_PRESETS = {
    dash: { dash: '8', label: '移动虚线' },
    dots: { dash: '2 10', label: '移动圆点' },
    pulse: { dash: '14 8', label: '强调流线' },
    particles: { dash: null, label: '红点流动' }
  };
  var DIRECTIONS = ['normal', 'reverse', 'alternate'];
  var SPEEDS = [300, 600, 1000];

  function normalizeSettings(value) {
    value = value || {};
    return {
      style: STYLE_PRESETS[value.style] ? value.style : 'dash',
      direction: DIRECTIONS.indexOf(value.direction) >= 0 ? value.direction : 'normal',
      speed: SPEEDS.indexOf(Number(value.speed)) >= 0 ? Number(value.speed) : 600
    };
  }

  function resolveDirect(root, edges) {
    return (edges || []).filter(function (edge) {
      return edgeVisible(edge) && edge.source === root;
    });
  }

  function resolvePath(root, edges, options) {
    options = options || {};
    var maxEdges = options.maxEdges == null ? 10000 : options.maxEdges;
    var outgoing = new Map();
    (edges || []).forEach(function (edge) {
      if (!edgeVisible(edge) || edge.source == null) return;
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      outgoing.get(edge.source).push(edge);
    });
    var queue = [root], seenNodes = new Set([root]), seenEdges = new Set(), result = [];
    for (var i = 0; i < queue.length; i++) {
      var node = queue[i];
      var candidates = outgoing.get(node) || [];
      for (var j = 0; j < candidates.length; j++) {
        var edge = candidates[j];
        if (seenEdges.has(edge.id)) continue;
        seenEdges.add(edge.id);
        if (result.length >= maxEdges) throw new Error('Path traversal budget exceeded');
        result.push(edge);
        if (edge.target != null && !seenNodes.has(edge.target)) {
          seenNodes.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    return result;
  }

  function createController(deps) {
    var generation = 0;
    var active = null;
    function activate(root, mode) {
      var next = mode === 'path' ? resolvePath(root, deps.getEdges(root, mode)) : resolveDirect(root, deps.getEdges(root, mode));
      if (active) deps.clear('replace');
      generation += 1;
      active = { root: root, mode: mode, generation: generation, edges: next };
      deps.apply(next, mode, generation);
      return active;
    }
    function clear(reason) {
      generation += 1;
      if (active) deps.clear(reason || 'clear');
      active = null;
    }
    return {
      activate: activate,
      clear: clear,
      getActive: function () { return active; },
      getGeneration: function () { return generation; }
    };
  }

  return {
    resolveDirect: resolveDirect,
    resolvePath: resolvePath,
    createController: createController,
    STYLE_PRESETS: STYLE_PRESETS,
    normalizeSettings: normalizeSettings,
    DIRECTIONS: DIRECTIONS,
    SPEEDS: SPEEDS
  };
}));
