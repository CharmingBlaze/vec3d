import { ctx, getObj } from '../core/context.js';
import { svgEl } from '../svg/elements.js';
import { parsePath, buildPath } from '../svg/path.js';
import { getEditorBBox } from '../svg/geometry.js';
import { onHandleDown, onNodeHandleDown, onMoveSurfaceDown } from '../canvas/handlers.js';
import { scheduleRealtime3D } from '../three/realtime.js';

function appendMoveSurface(bb) {
  const hit = svgEl('rect', {
    x: bb.x,
    y: bb.y,
    width: Math.max(bb.width, 1),
    height: Math.max(bb.height, 1),
    fill: 'transparent',
    stroke: 'none',
    class: 'move-surface',
  });
  hit.style.cursor = 'move';
  hit.addEventListener('mousedown', onMoveSurfaceDown);
  ctx.dom.handlesLayer.appendChild(hit);
}

export function clearHandles() {
  ctx.dom.handlesLayer.innerHTML = '';
}

export function showHandles() {
  clearHandles();
  if (ctx.state.tool === 'node') return showNodeHandles();
  ctx.state.selected.forEach((id) => {
    const o = getObj(id);
    if (!o?.el) return;
    const bb = getEditorBBox(o.el);
    appendMoveSurface(bb);
    const r = svgEl('rect', {
      x: bb.x - 3,
      y: bb.y - 3,
      width: bb.width + 6,
      height: bb.height + 6,
      fill: 'none',
      stroke: '#818cf8',
      'stroke-width': 0.8,
      'stroke-dasharray': '4,2',
      class: 'sel-box',
    });
    ctx.dom.handlesLayer.appendChild(r);
    const rotLine = svgEl('line', {
      x1: bb.x + bb.width / 2,
      y1: bb.y - 3,
      x2: bb.x + bb.width / 2,
      y2: bb.y - 28,
      class: 'ctrl-line rotate-line',
    });
    ctx.dom.handlesLayer.appendChild(rotLine);
    const rot = svgEl('circle', {
      cx: bb.x + bb.width / 2,
      cy: bb.y - 34,
      r: 7,
      fill: '#ffd60a',
      stroke: '#000',
      'stroke-width': 1.5,
      cursor: 'grab',
      class: 'rotate-handle',
    });
    rot.dataset.handleType = 'rotate';
    rot.dataset.oid = id;
    rot.addEventListener('mousedown', onHandleDown);
    ctx.dom.handlesLayer.appendChild(rot);
    const corners = [
      [bb.x, bb.y],
      [bb.x + bb.width, bb.y],
      [bb.x, bb.y + bb.height],
      [bb.x + bb.width, bb.y + bb.height],
      [bb.x + bb.width / 2, bb.y],
      [bb.x + bb.width / 2, bb.y + bb.height],
      [bb.x, bb.y + bb.height / 2],
      [bb.x + bb.width, bb.y + bb.height / 2],
    ];
    corners.forEach(([hx, hy], i) => {
      const h = svgEl('rect', {
        x: hx - 4,
        y: hy - 4,
        width: 8,
        height: 8,
        fill: '#fff',
        stroke: '#818cf8',
        'stroke-width': 1.5,
        rx: 1,
        cursor: 'nwse-resize',
      });
      h.dataset.handleType = 'scale';
      h.dataset.corner = i;
      h.dataset.oid = id;
      h.dataset.bbx = bb.x;
      h.dataset.bby = bb.y;
      h.dataset.bbw = bb.width;
      h.dataset.bbh = bb.height;
      h.style.cursor =
        i < 4 ? 'nwse-resize' : i === 4 || i === 5 ? 'ns-resize' : 'ew-resize';
      h.addEventListener('mousedown', onHandleDown);
      ctx.dom.handlesLayer.appendChild(h);
    });
  });
}

export function showNodeHandles() {
  clearHandles();
  const { state, dom } = ctx;
  state.selected.forEach((id) => {
    const o = getObj(id);
    if (!o) return;
    const tag = o.el.tagName.toLowerCase();
    if (!['path', 'polygon', 'polyline', 'rect', 'ellipse', 'circle', 'line'].includes(tag)) return;
    appendMoveSurface(getEditorBBox(o.el));
    const pts = tag === 'path'
      ? (o.type === 'tube' && o.data?.centerline?.length
          ? o.data.centerline.map((p) => ({ ...p }))
          : parsePath(o.el.getAttribute('d')))
      : tag === 'polygon' || tag === 'polyline'
        ? parsePoints(o.el.getAttribute('points'))
        : primitivePoints(o.el, tag);
    state.nodeHandles = pts;
    pts.forEach((pt, i) => {
      if (tag === 'path' && pt.c2x !== undefined) {
        dom.handlesLayer.appendChild(
          svgEl('line', { x1: pt.x, y1: pt.y, x2: pt.c2x, y2: pt.c2y, class: 'ctrl-line' }),
        );
      }
      if (tag === 'path' && i < pts.length - 1 && pts[i + 1].c1x !== undefined) {
        const n = pts[i + 1];
        dom.handlesLayer.appendChild(
          svgEl('line', { x1: pt.x, y1: pt.y, x2: n.c1x, y2: n.c1y, class: 'ctrl-line' }),
        );
      }
      if (tag === 'path' && pt.c1x !== undefined) {
        const ch = svgEl('circle', {
          cx: pt.c1x,
          cy: pt.c1y,
          r: 4,
          fill: '#ffd60a',
          stroke: '#000',
          'stroke-width': 0.8,
          cursor: 'move',
        });
        ch.dataset.nodeIdx = i;
        ch.dataset.ctrl = 'c1';
        ch.dataset.nodeKind = tag;
        ch.dataset.oid = id;
        ch.addEventListener('mousedown', onNodeHandleDown);
        dom.handlesLayer.appendChild(ch);
      }
      if (tag === 'path' && pt.c2x !== undefined) {
        const ch = svgEl('circle', {
          cx: pt.c2x,
          cy: pt.c2y,
          r: 4,
          fill: '#ff9100',
          stroke: '#000',
          'stroke-width': 0.8,
          cursor: 'move',
        });
        ch.dataset.nodeIdx = i;
        ch.dataset.ctrl = 'c2';
        ch.dataset.nodeKind = tag;
        ch.dataset.oid = id;
        ch.addEventListener('mousedown', onNodeHandleDown);
        dom.handlesLayer.appendChild(ch);
      }
      const a = svgEl('rect', {
        x: pt.x - 5,
        y: pt.y - 5,
        width: 10,
        height: 10,
        fill: i === 0 ? '#818cf8' : '#fff',
        stroke: '#818cf8',
        'stroke-width': 1.5,
        rx: 1,
        cursor: 'move',
      });
      a.dataset.nodeIdx = i;
      a.dataset.ctrl = 'anchor';
      a.dataset.nodeKind = tag;
      a.dataset.oid = id;
      a.addEventListener('mousedown', onNodeHandleDown);
      dom.handlesLayer.appendChild(a);
    });
  });
}

export function updatePath(oid, nodeKind = 'path') {
  const o = getObj(oid);
  if (!o) return;
  const tag = nodeKind || o.el.tagName.toLowerCase();
  if (tag === 'polygon' || tag === 'polyline') {
    o.el.setAttribute('points', buildPoints(ctx.state.nodeHandles));
    o.data = { ...(o.data || {}), pts: [...ctx.state.nodeHandles] };
    notifyRealtimeGeometry(oid);
    return;
  }
  if (tag === 'rect') {
    const bb = bboxFromPoints(ctx.state.nodeHandles);
    o.el.setAttribute('x', bb.x);
    o.el.setAttribute('y', bb.y);
    o.el.setAttribute('width', Math.max(1, bb.width));
    o.el.setAttribute('height', Math.max(1, bb.height));
    notifyRealtimeGeometry(oid);
    return;
  }
  if (tag === 'ellipse' || tag === 'circle') {
    const bb = bboxFromPoints(ctx.state.nodeHandles);
    o.el.setAttribute('cx', bb.x + bb.width / 2);
    o.el.setAttribute('cy', bb.y + bb.height / 2);
    if (tag === 'circle') {
      o.el.setAttribute('r', Math.max(1, Math.min(bb.width, bb.height) / 2));
    } else {
      o.el.setAttribute('rx', Math.max(1, bb.width / 2));
      o.el.setAttribute('ry', Math.max(1, bb.height / 2));
    }
    notifyRealtimeGeometry(oid);
    return;
  }
  if (tag === 'line') {
    const pts = ctx.state.nodeHandles;
    if (pts[0] && pts[1]) {
      o.el.setAttribute('x1', pts[0].x);
      o.el.setAttribute('y1', pts[0].y);
      o.el.setAttribute('x2', pts[1].x);
      o.el.setAttribute('y2', pts[1].y);
    }
    notifyRealtimeGeometry(oid);
    return;
  }
  o.el.setAttribute('d', buildPath(ctx.state.nodeHandles));
  if (o.type === 'tube') {
    o.data = {
      ...(o.data || {}),
      centerline: ctx.state.nodeHandles.map((p) => ({ x: p.x, y: p.y })),
    };
  }
  notifyRealtimeGeometry(oid);
}

function notifyRealtimeGeometry(oid) {
  ctx.scene?.notifyGeometry([oid]);
  scheduleRealtime3D();
}

function parsePoints(points = '') {
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

function buildPoints(pts) {
  return pts.map((pt) => `${pt.x},${pt.y}`).join(' ');
}

function primitivePoints(el, tag) {
  if (tag === 'rect') {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (tag === 'ellipse' || tag === 'circle') {
    const cx = +el.getAttribute('cx') || 0;
    const cy = +el.getAttribute('cy') || 0;
    const rx = +el.getAttribute('rx') || +el.getAttribute('r') || 0;
    const ry = +el.getAttribute('ry') || +el.getAttribute('r') || 0;
    return [
      { x: cx, y: cy - ry },
      { x: cx + rx, y: cy },
      { x: cx, y: cy + ry },
      { x: cx - rx, y: cy },
    ];
  }
  if (tag === 'line') {
    return [
      { x: +el.getAttribute('x1') || 0, y: +el.getAttribute('y1') || 0 },
      { x: +el.getAttribute('x2') || 0, y: +el.getAttribute('y2') || 0 },
    ];
  }
  return [];
}

function bboxFromPoints(pts) {
  const xs = pts.map((pt) => pt.x);
  const ys = pts.map((pt) => pt.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
