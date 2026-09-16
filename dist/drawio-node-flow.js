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

(function (root) {
  var Core = root.NodeFlowCore;
  if (!Core || typeof root.Draw === 'undefined' || !root.Draw.loadPlugin) return;

  root.Draw.loadPlugin(function (ui) {
    var graph = ui.editor && ui.editor.graph;
    if (!graph || !graph.model || !graph.view) return;
    var graphModel = graph.model;
    var activePaths = new Map();
    var disposers = [];
    var disposed = false;
    var reapplyFrame = null;
    var enabled = true;
    var settings = loadSettings();
    var generation = 0;
    var animationStyle = null;
    var languageMode = '__NODE_FLOW_LANGUAGE__';

    function getLanguage() {
      if (languageMode === 'zh' || languageMode === 'en') return languageMode;
      var value = (root.mxLanguage || (root.navigator && (root.navigator.language || root.navigator.userLanguage)) || 'en').toLowerCase();
      return value.indexOf('zh') === 0 ? 'zh' : 'en';
    }

    function label(zh, en) { return getLanguage() === 'zh' ? zh : en; }

    function loadSettings() {
      try { return Core.normalizeSettings(JSON.parse(root.localStorage.getItem('nodeFlowSettings') || '{}')); }
      catch (_) { return Core.normalizeSettings(); }
    }

    function saveSettings() {
      try { root.localStorage.setItem('nodeFlowSettings', JSON.stringify(settings)); } catch (_) {}
    }

    function setSettings(patch) {
      if (typeof controller !== 'undefined' && controller && controller.getActive()) detachAll();
      settings = Core.normalizeSettings(Object.assign({}, settings, patch));
      saveSettings();
      reapply();
    }

    function installAnimationStyle() {
      if (!root.document || !root.document.head) return;
      animationStyle = root.document.createElement('style');
      animationStyle.setAttribute('data-node-flow-animation', '1');
      animationStyle.textContent = [
        '@keyframes nodeFlowDash { to { stroke-dashoffset: -16; } }',
        '@keyframes nodeFlowDashReverse { to { stroke-dashoffset: 16; } }',
        '@keyframes nodeFlowPulse { 50% { opacity: .55; } }',
        '.nodeFlowAnimation { animation-timing-function: linear; animation-iteration-count: infinite; }',
        '.nodeFlowDirection-normal { animation-name: nodeFlowDash; }',
        '.nodeFlowDirection-reverse { animation-name: nodeFlowDashReverse; }',
        '.nodeFlowDirection-alternate { animation-name: nodeFlowDash; animation-direction: alternate; }',
        '.nodeFlowStyle-pulse { animation-name: nodeFlowPulse; }'
      ].join('\n');
      root.document.head.appendChild(animationStyle);
    }
    installAnimationStyle();

    function listen(target, event, handler) {
      if (!target || !target.addListener) return;
      target.addListener(event, handler);
      disposers.push(function () { if (target.removeListener) target.removeListener(handler); });
    }

    function pathFor(edge) {
      var state = graph.view.getState(edge);
      if (!state || !state.shape) return null;
      if (typeof state.shape.getFlowAnimationPath === 'function') {
        return state.shape.getFlowAnimationPath();
      }
      var node = state.shape.node;
      if (!node || !node.getElementsByTagName) return null;
      var paths = node.getElementsByTagName('path');
      for (var i = 0; i < paths.length; i++) {
        if (paths[i].getAttribute('stroke') !== 'none' && paths[i].getAttribute('d')) return paths[i];
      }
      return null;
    }

    function attach(edge) {
      var path = pathFor(edge);
      if (!path) return;
      var existing = activePaths.get(edge);
      if (existing && existing.path !== path) {
        restore(existing);
        existing = null;
      }
      if (!existing) {
        existing = {
          path: path,
          hadFlowClass: path.classList ? path.classList.contains('mxEdgeFlow') : false,
          hadNodeFlowClass: path.classList ? path.classList.contains('nodeFlowAnimation') : false,
          hadStyleClasses: ['nodeFlowStyle-dash', 'nodeFlowStyle-dots', 'nodeFlowStyle-pulse', 'nodeFlowDirection-normal', 'nodeFlowDirection-reverse', 'nodeFlowDirection-alternate'].reduce(function (result, name) { result[name] = path.classList ? path.classList.contains(name) : false; return result; }, {}),
          hadDash: path.hasAttribute('stroke-dasharray'),
          dash: path.getAttribute('stroke-dasharray'),
          animation: path.style.animation,
          particles: []
        };
        activePaths.set(edge, existing);
      }
      if (settings.style === 'particles') {
        attachParticles(path, existing);
        return;
      }
      if (path.classList) path.classList.add('mxEdgeFlow');
      if (path.classList) {
        ['nodeFlowStyle-dash', 'nodeFlowStyle-dots', 'nodeFlowStyle-pulse', 'nodeFlowDirection-normal', 'nodeFlowDirection-reverse', 'nodeFlowDirection-alternate'].forEach(function (name) { path.classList.remove(name); });
        path.classList.add('nodeFlowAnimation', 'nodeFlowStyle-' + settings.style, 'nodeFlowDirection-' + settings.direction);
      }
      path.setAttribute('stroke-dasharray', Core.STYLE_PRESETS[settings.style].dash);
      path.style.animationDuration = settings.speed + 'ms';
      path.style.animationName = settings.style === 'pulse' ? 'nodeFlowPulse' : (settings.direction === 'reverse' ? 'nodeFlowDashReverse' : 'nodeFlowDash');
      path.style.animationTimingFunction = 'linear';
      path.style.animationIterationCount = 'infinite';
      path.style.animationDirection = settings.direction === 'alternate' ? 'alternate' : 'normal';
    }

    function removeParticles(record) {
      (record && record.particles || []).forEach(function (circle) {
        if (circle && circle.parentNode) circle.parentNode.removeChild(circle);
      });
      if (record) record.particles = [];
    }

    function attachParticles(path, record) {
      var d = path.getAttribute && path.getAttribute('d');
      var parent = path.parentNode;
      var duration = particleDuration(path);
      var count = particleCount(path);
      if (!d || !parent || !root.document || !root.document.createElementNS) return;
      if (record.particlePath === path && record.particleD === d && record.particles.length === count) {
        record.particles.forEach(function (circle, index) {
          var motion = circle.firstChild;
          if (motion) {
            motion.setAttribute('dur', duration + 'ms');
            motion.setAttribute('begin', (-index * duration / count) + 'ms');
          }
        });
        return;
      }
      removeParticles(record);
      record.particlePath = path;
      record.particleD = d;
      var ns = 'http://www.w3.org/2000/svg';
      for (var i = 0; i < count; i++) {
        var circle = root.document.createElementNS(ns, 'circle');
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', '#e53935');
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('pointer-events', 'none');
        circle.setAttribute('data-node-flow-particle', '1');
        var motion = root.document.createElementNS(ns, 'animateMotion');
        motion.setAttribute('path', d);
        motion.setAttribute('dur', duration + 'ms');
        motion.setAttribute('begin', (-i * duration / count) + 'ms');
        motion.setAttribute('repeatCount', 'indefinite');
        motion.setAttribute('calcMode', 'linear');
        motion.setAttribute('keyTimes', settings.direction === 'alternate' ? '0;.5;1' : '0;1');
        motion.setAttribute('keyPoints', settings.direction === 'reverse' ? '1;0' : (settings.direction === 'alternate' ? '0;1;0' : '0;1'));
        circle.appendChild(motion);
        parent.appendChild(circle);
        record.particles.push(circle);
      }
    }

    function pathLength(path) {
      var length = 0;
      try {
        if (path && typeof path.getTotalLength === 'function') length = path.getTotalLength();
      } catch (_) {}
      if (!isFinite(length) || length <= 0) length = 240;
      return length;
    }

    function particleDuration(path) {
      return settings.speed * 2 * (pathLength(path) / 100);
    }

    function particleCount(path) {
      var length = pathLength(path);
      return Math.max(2, Math.min(12, Math.round(length / 100)));
    }

    function restore(record) {
      var path = record && record.path;
      removeParticles(record);
      if (!path || !path.isConnected) return;
      if (path.classList && !record.hadFlowClass) path.classList.remove('mxEdgeFlow');
      if (path.classList && !record.hadNodeFlowClass) path.classList.remove('nodeFlowAnimation');
      if (path.classList) Object.keys(record.hadStyleClasses || {}).forEach(function (name) { if (!record.hadStyleClasses[name]) path.classList.remove(name); });
      if (record.hadDash) path.setAttribute('stroke-dasharray', record.dash);
      else path.removeAttribute('stroke-dasharray');
      path.style.animation = record.animation || '';
    }

    function detachAll() {
      activePaths.forEach(function (record) {
        restore(record);
      });
      activePaths.clear();
    }

    function reapply() {
      reapplyFrame = null;
      var active = controller.getActive();
      if (disposed || !enabled || !active) return;
      active.edges.forEach(attach);
      if (root.requestAnimationFrame) reapplyFrame = root.requestAnimationFrame(reapply);
    }

    function edgesFor(rootCell) {
      var connected = graph.getConnections ? graph.getConnections(rootCell) : [];
      return (connected || []).map(function (edge) {
        var source = graphModel.getTerminal(edge, true);
        var target = graphModel.getTerminal(edge, false);
        return { id: edge.id, source: source && source.id, target: target && target.id, cell: edge };
      });
    }

    function activate(rootCell, mode) {
      if (!enabled || disposed || !rootCell || !graphModel.isVertex(rootCell)) return;
      try { controller.activate(rootCell.id, mode); }
      catch (error) { controller.clear('error'); if (ui.handleError) ui.handleError(error); return; }
      reapply();
    }

    function selectionChanged() {
      if (disposed || !enabled) return;
      var cells = graph.getSelectionCells ? graph.getSelectionCells() : [];
      if (cells.length !== 1 || !graphModel.isVertex(cells[0])) { controller.clear('selection'); return; }
      activate(cells[0], 'direct');
    }

    var controller = Core.createController({
      getEdges: function () {
        var byId = new Map();
        var cells = [];
        if (graphModel.cells) {
          Object.keys(graphModel.cells).forEach(function (id) {
            var cell = graphModel.cells[id];
            if (cell && graphModel.isEdge(cell)) cells.push(cell);
          });
        }
        cells.forEach(function (cell) {
          var source = graphModel.getTerminal(cell, true);
          var target = graphModel.getTerminal(cell, false);
          byId.set(cell.id, { id: cell.id, source: source && source.id, target: target && target.id, cell: cell });
        });
        return Array.from(byId.values());
      },
      apply: function (edges, mode) {
        generation += 1;
        edges.forEach(function (edge) { attach(edge.cell || edge); });
        reapply();
        controller.lastMode = mode;
      },
      clear: function () { detachAll(); }
    });

    function mouseHandler(sender, evt) {
      var eventName = evt.getProperty('eventName');
      if (eventName !== 'mouseDown') return;
      var nativeEvent = evt.getProperty('event');
      var state = nativeEvent && nativeEvent.getState ? nativeEvent.getState() : null;
      var cell = state && state.cell;
      if (cell && graphModel.isVertex(cell) && nativeEvent && (nativeEvent.isShiftDown ? nativeEvent.isShiftDown() : root.mxEvent && root.mxEvent.isShiftDown(nativeEvent.getEvent()))) {
        root.setTimeout(function () { if (!disposed && enabled) { controller.rootCell = cell; activate(cell, 'path'); } }, 0);
      }
    }

    listen(graph.getSelectionModel && graph.getSelectionModel(), root.mxEvent ? root.mxEvent.CHANGE : 'change', selectionChanged);
    listen(graph, root.mxEvent ? root.mxEvent.FIRE_MOUSE_EVENT : 'fireMouseEvent', mouseHandler);

    var oldRefresh = graph.refresh;
    if (typeof oldRefresh === 'function') {
      graph.refresh = function () { var result = oldRefresh.apply(this, arguments); reapply(); return result; };
      disposers.push(function () { if (graph.refresh !== oldRefresh) graph.refresh = oldRefresh; });
    }

    function stop() { controller.clear('manual'); }
    function toggle() { enabled = !enabled; if (!enabled) stop(); }

    function installMenuLabels() {
      if (!root.mxResources || !root.mxResources.parse) return;
      root.mxResources.parse([
        'nodeFlowToggle=' + label('启用/禁用 Node Flow', 'Enable/Disable Node Flow'),
        'nodeFlowStyleDash=' + label('动画样式：移动虚线', 'Animation style: Moving dash'),
        'nodeFlowStyleDots=' + label('动画样式：移动圆点', 'Animation style: Moving dots'),
        'nodeFlowStylePulse=' + label('动画样式：强调流线', 'Animation style: Emphasis line'),
        'nodeFlowStyleParticles=' + label('动画样式：红点流动', 'Animation style: Red particles'),
        'nodeFlowDirectionNormal=' + label('动画方向：正向', 'Animation direction: Forward'),
        'nodeFlowDirectionReverse=' + label('动画方向：反向', 'Animation direction: Reverse'),
        'nodeFlowDirectionAlternate=' + label('动画方向：交替', 'Animation direction: Alternate'),
        'nodeFlowSpeedFast=' + label('动画速度：快速', 'Animation speed: Fast'),
        'nodeFlowSpeedNormal=' + label('动画速度：标准', 'Animation speed: Normal'),
        'nodeFlowSpeedSlow=' + label('动画速度：慢速', 'Animation speed: Slow'),
        'nodeFlowStop=' + label('停止 Node Flow', 'Stop Node Flow')
      ].join('\n'));
    }

    if (ui.actions && ui.actions.addAction) {
      installMenuLabels();
      ui.actions.addAction('nodeFlowStop', stop);
      var toggleAction = ui.actions.addAction('nodeFlowToggle', toggle);
      toggleAction.setToggleAction(true);
      toggleAction.setSelectedCallback(function () { return enabled; });
      var styleDashAction = ui.actions.addAction('nodeFlowStyleDash', function () { setSettings({ style: 'dash' }); });
      var styleDotsAction = ui.actions.addAction('nodeFlowStyleDots', function () { setSettings({ style: 'dots' }); });
      var stylePulseAction = ui.actions.addAction('nodeFlowStylePulse', function () { setSettings({ style: 'pulse' }); });
      var styleParticlesAction = ui.actions.addAction('nodeFlowStyleParticles', function () { setSettings({ style: 'particles' }); });
      [
        [styleDashAction, 'dash'], [styleDotsAction, 'dots'], [stylePulseAction, 'pulse'], [styleParticlesAction, 'particles']
      ].forEach(function (entry) {
        entry[0].setToggleAction(true);
        entry[0].setSelectedCallback(function () { return settings.style === entry[1]; });
      });
      var directionNormalAction = ui.actions.addAction('nodeFlowDirectionNormal', function () { setSettings({ direction: 'normal' }); });
      var directionReverseAction = ui.actions.addAction('nodeFlowDirectionReverse', function () { setSettings({ direction: 'reverse' }); });
      var directionAlternateAction = ui.actions.addAction('nodeFlowDirectionAlternate', function () { setSettings({ direction: 'alternate' }); });
      [[directionNormalAction, 'normal'], [directionReverseAction, 'reverse'], [directionAlternateAction, 'alternate']].forEach(function (entry) {
        entry[0].setToggleAction(true);
        entry[0].setSelectedCallback(function () { return settings.direction === entry[1]; });
      });
      var speedFastAction = ui.actions.addAction('nodeFlowSpeedFast', function () { setSettings({ speed: 300 }); });
      var speedNormalAction = ui.actions.addAction('nodeFlowSpeedNormal', function () { setSettings({ speed: 600 }); });
      var speedSlowAction = ui.actions.addAction('nodeFlowSpeedSlow', function () { setSettings({ speed: 1000 }); });
      [[speedFastAction, 300], [speedNormalAction, 600], [speedSlowAction, 1000]].forEach(function (entry) {
        entry[0].setToggleAction(true);
        entry[0].setSelectedCallback(function () { return settings.speed === entry[1]; });
      });
      var extras = ui.menus && ui.menus.get ? ui.menus.get('extras') : null;
      if (extras && extras.funct) {
        var oldExtras = extras.funct;
        extras.funct = function (menu, parent) {
          oldExtras.apply(this, arguments);
              installMenuLabels();
              ui.menus.addMenuItems(menu, ['-', 'nodeFlowToggle', 'nodeFlowStyleDash', 'nodeFlowStyleDots', 'nodeFlowStylePulse', 'nodeFlowStyleParticles', 'nodeFlowDirectionNormal', 'nodeFlowDirectionReverse', 'nodeFlowDirectionAlternate', 'nodeFlowSpeedFast', 'nodeFlowSpeedNormal', 'nodeFlowSpeedSlow', 'nodeFlowStop'], parent);
        };
      }
    }

    root.NodeFlowPlugin = {
      dispose: function () {
        if (disposed) return;
        disposed = true; enabled = false;
        if (reapplyFrame && root.cancelAnimationFrame) root.cancelAnimationFrame(reapplyFrame);
        detachAll();
        if (animationStyle && animationStyle.parentNode) animationStyle.parentNode.removeChild(animationStyle);
        disposers.splice(0).forEach(function (dispose) { try { dispose(); } catch (_) {} });
      },
      setSpeed: function (value) { setSettings({ speed: value }); },
      stop: stop,
      isEnabled: function () { return enabled; }
    };
  });
}(typeof globalThis !== 'undefined' ? globalThis : window));
