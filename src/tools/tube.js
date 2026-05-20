import { ctx } from '../core/context.js';
import { svgEl } from '../svg/elements.js';
import { buildPath, flattenPathPoints, isClosedLoop } from '../svg/path.js';
import { addObject } from '../editor/objects.js';
import { selectObj } from '../editor/selection.js';
import { smoothPencilPts } from './pencil.js';
import { tubeRadiusFromDepth } from '../core/tube-mode.js';
import { flushRealtime3D } from '../three/realtime.js';

/** Finish a rounded-tube stroke. Closed loops rebuild as filled topology cages. */
export function finishTubeStroke(rawPts) {
  const { state, dom } = ctx;
  dom.previewLayer.innerHTML = '';

  if (!rawPts || rawPts.length < 2) {
    state.pencilPts = [];
    state.pencilEl = null;
    return;
  }

  const smoothed = rawPts.length > 3 ? smoothPencilPts(rawPts, 3) : rawPts.map((p) => ({ ...p }));
  const closed = isClosedLoop(smoothed, 20);
  const centerline = flattenPathPoints(smoothed, 6);
  if (centerline.length < 2) {
    state.pencilPts = [];
    state.pencilEl = null;
    return;
  }

  if (closed && centerline.length >= 3) {
    const first = centerline[0];
    const last = centerline[centerline.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 2) centerline.pop();
  }

  const d = buildPath(smoothed, closed);
  const depth = +(dom.d3Depth?.value || 60);
  const profile = dom.d3Profile?.value || 'rounded';
  const radius = tubeRadiusFromDepth(state.strokeW, depth, profile);

  const el = svgEl('path', {
    d,
    fill: 'none',
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: state.opacity / 100,
    class: 'tube-stroke',
  });

  const o = addObject(el, 'tube', {
    centerline,
    closed,
    tubeSilhouette: closed,
    radius,
    tubularSegments: Math.max(48, Math.ceil(centerline.length * 2)),
    radialSegments: Math.max(16, +(dom.d3Cseg?.value || 12)),
  });

  if (closed) {
    o.fill = state.fillMode === 'none' ? state.stroke : state.fill;
    o.el.setAttribute('fill', o.fill);
    o.el.setAttribute('stroke', state.stroke);
  } else {
    o.fill = 'none';
    o.el.setAttribute('fill', 'none');
  }

  ctx.scene?.notifyStyle([o.id]);
  flushRealtime3D();
  selectObj(o.id);

  state.pencilPts = [];
  state.pencilEl = null;
}
