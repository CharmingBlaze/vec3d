import { ctx } from '../core/context.js';
import { svgEl } from '../svg/elements.js';
import { svgPoint } from '../svg/coordinates.js';
import { makePolygon, makeStar, makeShapePreset } from '../svg/shapes.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';
import { primitiveDataForTool, isPrimitiveDrawTool } from '../core/primitive-tools.js';
import { depthForPrimitiveDraw } from '../core/depth.js';
import { getDocumentD3 } from '../core/d3-settings.js';
import { resolveSnapPoint, findSnapTarget } from '../editor/node-snap.js';
import { mergeStrokeIntoPath } from '../editor/path-connect.js';
import { flushRealtime3D } from '../three/realtime.js';

const PREVIEW_STYLE = {
  fill: 'rgba(129, 140, 248, 0.12)',
  stroke: '#818cf8',
  opacity: 1,
  class: 'shape-preview guide-shape',
};

function previewStrokeWidth() {
  return Math.max(2, ctx.state.strokeW);
}

/** Sync drag preview from a shape preset (path, rect, or ellipse). */
function syncPresetPreview(cx, cy, w, h) {
  const { state, dom } = ctx;
  const preset = makeShapePreset(state.shape, cx, cy, w, h);
  if (!preset) return;

  const tag = preset.tagName.toLowerCase();
  const styleKeys = new Set(['fill', 'stroke', 'stroke-width', 'opacity', 'class']);
  const attrs = {
    ...PREVIEW_STYLE,
    fill: state.fillMode === 'none' ? 'none' : PREVIEW_STYLE.fill,
    'stroke-width': previewStrokeWidth(),
  };
  for (const attr of preset.attributes) {
    if (!styleKeys.has(attr.name)) attrs[attr.name] = attr.value;
  }

  if (!state.shapePreview || state.shapePreview.tagName.toLowerCase() !== tag) {
    state.shapePreview?.remove();
    state.shapePreview = svgEl(tag, attrs);
    dom.previewLayer.appendChild(state.shapePreview);
    return;
  }

  Object.entries(attrs).forEach(([key, val]) => state.shapePreview.setAttribute(key, val));
}

function presetObjectType(name) {
  if (name === 'oval') return 'ellipse';
  if (name === 'roundsquare' || name === 'roundrect') return 'rect';
  return 'shape';
}

export function startShapePreview(e) {
  const { state, dom } = ctx;
  const raw = svgPoint(e);
  const { x, y, snap } = resolveSnapPoint(raw, {});
  const p = { x, y };
  state.shapeStart = p;
  state.shapeStartSnap =
    state.tool === 'line' && snap?.isEndpoint && !snap.isOwnStroke ? snap : null;
  const attrs = {
    fill: state.fillMode === 'none' ? 'none' : 'rgba(0, 229, 255, 0.12)',
    stroke: '#818cf8',
    'stroke-width': Math.max(2, state.strokeW),
    opacity: 1,
    class: 'shape-preview guide-shape',
  };
  let el;
  if (state.tool === 'rect' || state.tool === 'box3d') el = svgEl('rect', { x: p.x, y: p.y, width: 0, height: 0, ...attrs });
  else if (state.tool === 'ellipse' || state.tool === 'sphere3d' || state.tool === 'cylinder3d') {
    el = svgEl('ellipse', { cx: p.x, cy: p.y, rx: 0, ry: 0, ...attrs });
  }
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
  const square = state.tool === 'sphere3d' ? Math.max(w, h) : w;
  const squareH = state.tool === 'sphere3d' ? Math.max(w, h) : h;
  const r = Math.min(square, squareH) / 2;
  const el = state.shapePreview;
  if (state.tool === 'rect' || state.tool === 'box3d') {
    el.setAttribute('x', Math.min(x1, x2));
    el.setAttribute('y', Math.min(y1, y2));
    el.setAttribute('width', w);
    el.setAttribute('height', h);
  } else if (state.tool === 'ellipse' || state.tool === 'cylinder3d') {
    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('rx', w / 2);
    el.setAttribute('ry', h / 2);
  } else if (state.tool === 'sphere3d') {
    el.setAttribute('cx', cx);
    el.setAttribute('cy', cy);
    el.setAttribute('rx', r);
    el.setAttribute('ry', r);
  } else if (state.tool === 'line') {
    const snap = findSnapTarget({ x: x2, y: y2 }, {});
    const endX = snap ? snap.x : x2;
    const endY = snap ? snap.y : y2;
    el.setAttribute('x2', endX);
    el.setAttribute('y2', endY);
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
    syncPresetPreview(cx, cy, w, h);
  }
}

export function finishShapePreview(e) {
  const { state, dom } = ctx;
  if (!state.shapeStart || !state.shapePreview) {
    state.shapeStart = null;
    state.shapeStartSnap = null;
    return;
  }
  const endResolved = resolveSnapPoint(svgPoint(e), {});
  const { x: x1, y: y1 } = state.shapeStart;
  const x2 = endResolved.x;
  const y2 = endResolved.y;
  const endSnap =
    endResolved.snap?.isEndpoint && !endResolved.snap.isOwnStroke ? endResolved.snap : null;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const sphereSize = Math.max(w, h);
  const r = sphereSize / 2;
  dom.previewLayer.innerHTML = '';
  state.shapePreview = null;

  if (w < 3 && h < 3) {
    state.shapeStart = null;
    state.shapeStartSnap = null;
    return;
  }

  if (state.tool === 'line') {
    const stroke = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const startSnap = state.shapeStartSnap;
    if (startSnap && mergeStrokeIntoPath(startSnap.oid, startSnap.index, stroke)) {
      state.shapeStart = null;
      state.shapeStartSnap = null;
      flushRealtime3D();
      return;
    }
    if (endSnap && mergeStrokeIntoPath(endSnap.oid, endSnap.index, stroke)) {
      state.shapeStart = null;
      state.shapeStartSnap = null;
      flushRealtime3D();
      return;
    }
  }

  const attrs = {
    fill: state.fillMode === 'none' ? 'none' : state.fill,
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    opacity: state.opacity / 100,
  };
  let el;
  let type = 'shape';
  const primitiveKind = primitiveDataForTool(state.tool);
  const extraData = primitiveKind ? { ...primitiveKind } : {};
  if (isPrimitiveDrawTool(state.tool)) {
    extraData.d3 = {
      ...getDocumentD3(),
      profile: 'slab',
      depth: depthForPrimitiveDraw(w, h, state.tool, getDocumentD3()),
    };
  }
  if (state.tool === 'rect' || state.tool === 'box3d') {
    el = svgEl('rect', { x: Math.min(x1, x2), y: Math.min(y1, y2), width: w, height: h, ...attrs });
    type = 'rect';
  } else if (state.tool === 'ellipse' || state.tool === 'cylinder3d') {
    el = svgEl('ellipse', { cx, cy, rx: w / 2, ry: h / 2, ...attrs });
    type = 'ellipse';
  } else if (state.tool === 'sphere3d') {
    el = svgEl('ellipse', { cx, cy, rx: r, ry: r, ...attrs });
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
    type = presetObjectType(state.shape);
  }
  if (!el) {
    state.shapeStart = null;
    state.shapeStartSnap = null;
    return;
  }
  const o = addObject(el, type, extraData);
  selectObj(o.id);
  state.shapeStart = null;
  state.shapeStartSnap = null;
}
