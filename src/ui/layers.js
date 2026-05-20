import { ctx, getScene } from '../core/context.js';
import { selectObj } from '../editor/selection.js';
import { saveHistory } from '../editor/history.js';
import { clearHandles } from '../editor/handles.js';

function isVisible(o) {
  return o.visible !== false;
}

export function refreshLayers() {
  const { state, dom } = ctx;
  dom.layerList.innerHTML = '';

  if (!state.objects.length) {
    const empty = document.createElement('div');
    empty.className = 'layer-empty';
    empty.textContent = 'No layers yet';
    dom.layerList.appendChild(empty);
  } else {
    [...state.objects].reverse().forEach((o) => {
      const visible = isVisible(o);
      const d = document.createElement('div');
      d.className = [
        'node-item',
        state.selected.includes(o.id) ? 'on' : '',
        !visible ? 'hidden' : '',
        o.locked ? 'locked' : '',
      ].filter(Boolean).join(' ');

      const vis = document.createElement('button');
      vis.className = `layer-btn layer-vis ${visible ? 'on' : 'off'}`;
      vis.type = 'button';
      vis.title = visible ? 'Hide layer' : 'Show layer';
      vis.setAttribute('aria-label', visible ? 'Hide layer' : 'Show layer');
      vis.textContent = visible ? '👁' : '◌';
      vis.onclick = (e) => {
        e.stopPropagation();
        setLayerVisible(o, !visible);
      };

      const lock = document.createElement('button');
      lock.className = `layer-btn layer-lock ${o.locked ? 'on' : ''}`;
      lock.type = 'button';
      lock.title = o.locked ? 'Unlock layer' : 'Lock layer';
      lock.setAttribute('aria-label', lock.title);
      lock.textContent = o.locked ? '🔒' : '🔓';
      lock.onclick = (e) => {
        e.stopPropagation();
        const next = !o.locked;
        getScene().setLocked(o.id, next);
        if (next) clearHandles();
        saveHistory();
      };

      const dot = document.createElement('div');
      dot.className = 'node-dot';
      dot.style.background = o.fill === 'none' ? o.stroke || '#888' : o.fill;

      const label = document.createElement('span');
      label.className = 'node-label';
      label.innerHTML = `${friendlyType(o.type)} #${o.id.split('_')[1]}<span class="node-meta">${layerMeta(o)}</span>`;

      d.append(vis, lock, dot, label);
      d.onclick = () => {
        if (o.locked) return;
        if (!isVisible(o)) {
          setLayerVisible(o, true);
          return;
        }
        selectObj(o.id, false);
      };
      dom.layerList.appendChild(d);
    });
  }

  if (dom.layerCount) {
    dom.layerCount.textContent = String(state.objects.length);
  }
  dom.sbObjs.textContent = `Objects: ${state.objects.length}`;
}

function setLayerVisible(o, visible) {
  getScene().setVisible(o.id, visible);
  if (!visible) clearHandles();
  saveHistory();
}

export function updateStatus() {
  const { state, dom } = ctx;
  dom.sbSel.textContent = state.selected.length
    ? `Selected: ${state.selected.length}`
    : 'No selection';
  refreshLayers();
}

function friendlyType(type) {
  const names = {
    path: 'Bezier path',
    tube: 'Rounded tube',
    polygon: 'Polygon',
    polyline: 'Polyline',
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    star: 'Star',
    line: 'Line',
    text: 'Text',
    shape: 'Shape',
  };
  return names[type] || type;
}

function layerMeta(o) {
  const fill = o.fill === 'none' ? 'outline' : o.fill || 'fill';
  const opacity = Math.round((o.op ?? 1) * 100);
  const parts = [`${fill}`, `${opacity}%`];
  if (o.locked) parts.push('locked');
  if (!isVisible(o)) parts.push('hidden');
  return parts.join(' · ');
}
