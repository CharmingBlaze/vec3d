import { ctx } from '../core/context.js';
import { svgEl } from '../svg/elements.js';
import { svgPoint } from '../svg/coordinates.js';
import { makePolygon, makeStar, makeShapePreset } from '../svg/shapes.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';

export function startShapePreview(e) {
  const { state, dom } = ctx;
  const p = svgPoint(e);
  state.shapeStart = p;
  const attrs = {
    fill: state.fillMode === 'none' ? 'none' : 'rgba(0, 229, 255, 0.12)',
    stroke: '#00e5ff',
    'stroke-width': Math.max(2, state.strokeW),
    opacity: 1,
    class: 'shape-preview guide-shape',
  };
  let el;
  if (state.tool === 'rect') el = svgEl('rect', { x: p.x, y: p.y, width: 0, height: 0, ...attrs });
  else if (state.tool === 'ellipse') el = svgEl('ellipse', { cx: p.x, cy: p.y, rx: 0, ry: 0, ...attrs });
  else if (state.tool === 'line') el = svgEl('line', { x1: p.x, y1: p.y, x2: p.x, y2: p.y, ...attrs, fill: 'none' });
  else if (state.tool === 'polygon' || state.tool === 'star') el = svgEl('polygon', { points: '0,0', ...attrs });
  else if (state.tool === 'shape') el = svgEl('path', { d: 'M 0 0', ...attrs });
  state.shapePreview = el;
  if (el) dom.previewLayer.appendChild(el);
}

export function updateShapePreview(e) {
  const { state } = ctx;
  if (!state.shapeStart || !state.shapePreview) return;
  const p = svgPoint(e);
  const { x: x1, y: y1 } = state.shapeStart;
  const x2 = p.x;
  const y2 = p.y;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const r = Math.min(w, h) / 2;
  const el = state.shapePreview;
  if (state.tool === 'rect') {
    el.setAttribute('x', Math.min(x1, x2));
    el.setAttribute('y', Math.min(y1, y2));
    el.setAttribute('width', w);
    el.setAttribute('height', h);
  } else if (state.tool === 'ellipse') {
    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('rx', w / 2);
    el.setAttribute('ry', h / 2);
  } else if (state.tool === 'line') {
    el.setAttribute('x2', x2);
    el.setAttribute('y2', y2);
  } else if (state.tool === 'polygon') {
    const pts = [];
    const sides = state.sides;
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides - Math.PI / 2;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    el.setAttribute('points', pts.join(' '));
  } else if (state.tool === 'star') {
    const pts2 = [];
    const ns = state.sides;
    const ir = r * 0.42;
    for (let i = 0; i < ns * 2; i++) {
      const a = (i * Math.PI) / ns - Math.PI / 2;
      const rad = i % 2 ? ir : r;
      pts2.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
    }
    el.setAttribute('points', pts2.join(' '));
  } else if (state.tool === 'shape') {
    const d = makeShapePreset(state.shape, cx, cy, w, h);
    el.setAttribute('d', d.getAttribute?.('d') || '');
  }
}

export function finishShapePreview(e) {
  const { state, dom } = ctx;
  if (!state.shapeStart || !state.shapePreview) {
    state.shapeStart = null;
    return;
  }
  const p = svgPoint(e);
  const { x: x1, y: y1 } = state.shapeStart;
  const x2 = p.x;
  const y2 = p.y;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const r = Math.min(w, h) / 2;
  dom.previewLayer.innerHTML = '';
  state.shapePreview = null;

  if (w < 3 && h < 3) {
    state.shapeStart = null;
    return;
  }

  const attrs = {
    fill: state.fillMode === 'none' ? 'none' : state.fill,
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    opacity: state.opacity / 100,
  };
  let el;
  let type = 'shape';
  if (state.tool === 'rect') {
    el = svgEl('rect', { x: Math.min(x1, x2), y: Math.min(y1, y2), width: w, height: h, ...attrs });
    type = 'rect';
  } else if (state.tool === 'ellipse') {
    el = svgEl('ellipse', { cx, cy, rx: w / 2, ry: h / 2, ...attrs });
    type = 'ellipse';
  } else if (state.tool === 'line') {
    el = svgEl('line', {
      x1,
      y1,
      x2,
      y2,
      stroke: state.stroke,
      'stroke-width': state.strokeW,
      ...attrs,
      fill: 'none',
    });
    type = 'line';
  } else if (state.tool === 'polygon') {
    el = makePolygon(cx, cy, r, state.sides, attrs);
    type = 'polygon';
  } else if (state.tool === 'star') {
    el = makeStar(cx, cy, r, r * 0.42, state.sides, attrs);
    type = 'star';
  } else if (state.tool === 'shape') {
    el = makeShapePreset(state.shape, cx, cy, w, h);
    type = 'shape';
  }
  if (!el) {
    state.shapeStart = null;
    return;
  }
  const o = addObject(el, type);
  selectObj(o.id);
  state.shapeStart = null;
}
