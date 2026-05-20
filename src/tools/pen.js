import { ctx } from '../core/context.js';
import { svgEl, applyStyle } from '../svg/elements.js';
import { buildPath } from '../svg/path.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';
import { svgPoint } from '../svg/coordinates.js';

export function penClick(e) {
  const { state, dom } = ctx;
  const p = svgPoint(e);
  if (e.detail === 2) {
    finishPen(true);
    return;
  }
  if (state.penPoints.length >= 3) {
    const first = state.penPoints[0];
    if (Math.hypot(p.x - first.x, p.y - first.y) < 10) {
      finishPen(true);
      return;
    }
  }
  const pt = { x: p.x, y: p.y };
  state.penPoints.push(pt);
  updatePenPreview();
}

export function dragPenCurve(e) {
  const { state } = ctx;
  if (!state.penPoints.length) return;
  const p = svgPoint(e);
  const cur = state.penPoints[state.penPoints.length - 1];
  const dx = p.x - cur.x;
  const dy = p.y - cur.y;
  if (Math.hypot(dx, dy) < 2) return;
  cur.c1x = cur.x - dx;
  cur.c1y = cur.y - dy;
  cur.c2x = cur.x + dx;
  cur.c2y = cur.y + dy;
  updatePenPreview();
}

export function updatePenPreview() {
  const { state, dom } = ctx;
  if (!state.penPoints.length) return;
  const d = buildPath(state.penPoints);
  if (!state.penEl) {
    state.penEl = svgEl('path', {
      d,
      fill: 'none',
      stroke: state.stroke,
      'stroke-width': state.strokeW,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'pen-preview guide-path',
    });
    dom.previewLayer.appendChild(state.penEl);
  } else {
    state.penEl.setAttribute('d', d);
  }
  dom.previewLayer.querySelectorAll('.pen-anchor').forEach((el) => el.remove());
  state.penPoints.forEach((pt) => {
    dom.previewLayer.appendChild(
      svgEl('circle', { cx: pt.x, cy: pt.y, r: 3, fill: '#818cf8', class: 'pen-anchor' }),
    );
    if (pt.c2x !== undefined) {
      if (pt.c1x !== undefined) {
        dom.previewLayer.appendChild(
          svgEl('line', {
            x1: pt.x,
            y1: pt.y,
            x2: pt.c1x,
            y2: pt.c1y,
            stroke: '#ff9100',
            'stroke-width': 0.8,
            'stroke-dasharray': '2,2',
            class: 'pen-anchor',
          }),
        );
        dom.previewLayer.appendChild(
          svgEl('circle', { cx: pt.c1x, cy: pt.c1y, r: 3, fill: '#ff9100', class: 'pen-anchor' }),
        );
      }
      dom.previewLayer.appendChild(
        svgEl('line', {
          x1: pt.x,
          y1: pt.y,
          x2: pt.c2x,
          y2: pt.c2y,
          stroke: '#ffd60a',
          'stroke-width': 0.8,
          'stroke-dasharray': '2,2',
          class: 'pen-anchor',
        }),
      );
      dom.previewLayer.appendChild(
        svgEl('circle', { cx: pt.c2x, cy: pt.c2y, r: 3, fill: '#ffd60a', class: 'pen-anchor' }),
      );
    }
  });
}

export function finishPen(closePath = false) {
  const { state, dom } = ctx;
  if (state.penPoints.length < 2) {
    dom.previewLayer.innerHTML = '';
    state.penPoints = [];
    state.penEl = null;
    return;
  }
  const pts = [...state.penPoints];
  if (closePath && pts.length >= 3) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) > 8) {
      pts.push({ x: first.x, y: first.y });
    }
  }
  const d = buildPath(pts, closePath && pts.length >= 3);
  const el = svgEl('path', {
    d,
    fill: state.fillMode === 'none' ? 'none' : state.fill,
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });
  applyStyle(el, state.fill, state.stroke, state.strokeW, state.opacity / 100);
  const o = addObject(el, 'path', { pts: [...state.penPoints] });
  dom.previewLayer.innerHTML = '';
  state.penPoints = [];
  state.penEl = null;
  selectObj(o.id);
}
