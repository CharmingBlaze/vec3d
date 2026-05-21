import { ctx } from '../core/context.js';
import { shouldDrawAsTube } from '../core/tube-mode.js';
import { getDocumentD3 } from '../core/d3-settings.js';
import { prepareOutlineForMeshing } from '../topology/prepareOutlineForMeshing.js';
import { resolveTopologySettings, toPrepareOptions } from '../topology/topology-settings.js';
import { svgEl } from '../svg/elements.js';
import { buildPath } from '../svg/path.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';
import { finishTubeStroke } from './tube.js';

/** Ramer-Douglas-Peucker simplify then smooth bezier handles */
export function smoothPencilPts(pts, eps = 5) {
  if (pts.length < 3) return pts;

  function dist2(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy + 1e-9)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function rdp(p, s, e) {
    let mx = 0;
    let mi = s;
    for (let i = s + 1; i < e; i++) {
      const d = dist2(p[i], p[s], p[e]);
      if (d > mx) {
        mx = d;
        mi = i;
      }
    }
    return mx > eps
      ? [...rdp(p, s, mi, eps), ...rdp(p, mi, e, eps).slice(1)]
      : [p[s], p[e]];
  }

  const simp = rdp(pts, 0, pts.length - 1, eps);
  const buildPts = simp.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 1; i < buildPts.length - 1; i++) {
    const prev = buildPts[i - 1];
    const cur = buildPts[i];
    const next = buildPts[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = 0.25;
    cur.c1x = cur.x - (dx / len) * Math.hypot(cur.x - prev.x, cur.y - prev.y) * t;
    cur.c1y = cur.y - (dy / len) * Math.hypot(cur.x - prev.x, cur.y - prev.y) * t;
    cur.c2x = cur.x + (dx / len) * Math.hypot(cur.x - next.x, cur.y - next.y) * t;
    cur.c2y = cur.y + (dy / len) * Math.hypot(cur.x - next.x, cur.y - next.y) * t;
  }
  return buildPts;
}

export function finishPencilStroke() {
  const { state, dom } = ctx;
  if (shouldDrawAsTube()) {
    if (state.pencilPts.length >= 2) finishTubeStroke(state.pencilPts);
    else dom.previewLayer.innerHTML = '';
    state.pencilPts = [];
    state.pencilEl = null;
    return;
  }
  if (state.pencilPts.length > 3) {
    dom.previewLayer.innerHTML = '';
    const smoothed = smoothPencilPts(state.pencilPts);
    const closed =
      state.freehandAutoClose &&
      Math.hypot(
        smoothed[0].x - smoothed[smoothed.length - 1].x,
        smoothed[0].y - smoothed[smoothed.length - 1].y,
      ) < 20;
    const d = buildPath(smoothed, closed);
    const el = svgEl('path', {
      d,
      fill: closed && state.fillMode !== 'none' ? state.fill : 'none',
      stroke: state.stroke,
      'stroke-width': state.strokeW,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      opacity: state.opacity / 100,
    });
    const o = addObject(el, 'path', {
      pts: smoothed,
      closed,
      meshOutline: (() => {
        if (!closed) return null;
        const topo = resolveTopologySettings(getDocumentD3());
        const prepared = prepareOutlineForMeshing(
          state.pencilPts.map((pt) => ({ x: pt.x, y: pt.y })),
          toPrepareOptions(topo),
        );
        return prepared.isValid ? prepared.resampled : null;
      })(),
    });
    selectObj(o.id);
  } else {
    dom.previewLayer.innerHTML = '';
  }
  state.pencilPts = [];
  state.pencilEl = null;
}
