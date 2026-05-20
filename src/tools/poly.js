import { ctx } from '../core/context.js';
import { svgEl } from '../svg/elements.js';
import { svgPoint } from '../svg/coordinates.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';

export function polyClick(e) {
  const { state } = ctx;
  const p = svgPoint(e);
  if (e.detail === 2) {
    finishPoly(true);
    return;
  }
  if (state.polyPoints.length >= 3) {
    const first = state.polyPoints[0];
    if (Math.hypot(p.x - first.x, p.y - first.y) < 10) {
      finishPoly(true);
      return;
    }
  }
  state.polyPoints.push({ x: p.x, y: p.y });
  updatePolyPreview();
}

export function updatePolyPreview(cursorPoint) {
  const { state, dom } = ctx;
  if (!state.polyPoints.length) return;
  const pts = [...state.polyPoints];
  if (cursorPoint) pts.push(cursorPoint);
  const points = pts.map((p) => `${p.x},${p.y}`).join(' ');
  if (!state.polyEl) {
    state.polyEl = svgEl('polyline', {
      points,
      fill: 'none',
      stroke: '#818cf8',
      'stroke-width': Math.max(2, state.strokeW),
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      class: 'poly-preview guide-path',
    });
    dom.previewLayer.appendChild(state.polyEl);
  } else {
    state.polyEl.setAttribute('points', points);
  }
  dom.previewLayer.querySelectorAll('.poly-anchor').forEach((el) => el.remove());
  state.polyPoints.forEach((pt, i) => {
    dom.previewLayer.appendChild(
      svgEl('rect', {
        x: pt.x - 4,
        y: pt.y - 4,
        width: 8,
        height: 8,
        rx: 1,
        fill: i === 0 ? '#818cf8' : '#ffffff',
        stroke: '#818cf8',
        'stroke-width': 1.2,
        class: 'poly-anchor',
      }),
    );
  });
}

export function finishPoly(closeShape = true) {
  const { state, dom } = ctx;
  if (state.polyPoints.length < 2) {
    clearPolyPreview();
    return;
  }
  const points = state.polyPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const tag = closeShape && state.polyPoints.length >= 3 ? 'polygon' : 'polyline';
  const el = svgEl(tag, {
    points,
    fill: tag === 'polygon' && state.fillMode !== 'none' ? state.fill : 'none',
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    opacity: state.opacity / 100,
  });
  const o = addObject(el, tag, { pts: [...state.polyPoints] });
  clearPolyPreview();
  dom.sbTool.textContent = `Tool: ${state.tool}`;
  selectObj(o.id);
}

export function clearPolyPreview() {
  const { state, dom } = ctx;
  dom.previewLayer.querySelectorAll('.poly-preview,.poly-anchor').forEach((el) => el.remove());
  state.polyPoints = [];
  state.polyEl = null;
}
