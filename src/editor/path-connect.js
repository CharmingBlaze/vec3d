import { ctx, getObj } from '../core/context.js';
import { buildPath } from '../svg/path.js';
import { mapFromEditor } from '../svg/geometry.js';
import { saveHistory } from './history.js';
import { selectObj } from './selection.js';
import { showNodeHandles } from './handles.js';
import { getObjectAnchorPointsEditor } from './node-snap.js';
import { smoothPencilPts } from '../tools/pencil.js';

function mapPointFromEditor(el, pt) {
  const out = { ...pt };
  const p = mapFromEditor(el, pt.x, pt.y);
  out.x = p.x;
  out.y = p.y;
  if (pt.c1x !== undefined) {
    const c1 = mapFromEditor(el, pt.c1x, pt.c1y);
    out.c1x = c1.x;
    out.c1y = c1.y;
  }
  if (pt.c2x !== undefined) {
    const c2 = mapFromEditor(el, pt.c2x, pt.c2y);
    out.c2x = c2.x;
    out.c2y = c2.y;
  }
  return out;
}

function mapPointsFromEditor(el, pts) {
  return pts.map((pt) => mapPointFromEditor(el, pt));
}

function buildPointsAttr(pts) {
  return pts.map((pt) => `${pt.x},${pt.y}`).join(' ');
}

function near(a, b, slack = 2) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= slack;
}

/**
 * Merge an in-progress stroke into an existing path at a node index.
 * @param {string} targetOid
 * @param {number} endpointIndex
 * @param {{ x: number, y: number, c1x?: number, c1y?: number, c2x?: number, c2y?: number }[]} strokePts editor space
 */
export function mergeStrokeIntoPath(targetOid, endpointIndex, strokePts) {
  const o = getObj(targetOid);
  if (!o?.el || !strokePts?.length) return false;

  const tag = o.el.tagName.toLowerCase();
  if (!['path', 'polyline', 'polygon'].includes(tag)) return false;

  const existing = getObjectAnchorPointsEditor(o);
  if (!existing.length) return false;

  const junction = existing[endpointIndex];
  if (!junction) return false;

  let extra = strokePts.map((p) => ({ ...p }));
  if (near(extra[0], junction)) extra = extra.slice(1);
  if (!extra.length) return false;

  let mergedEditor;
  if (endpointIndex === 0) {
    mergedEditor = [...extra.slice().reverse(), ...existing.slice(1)];
  } else {
    mergedEditor = [...existing, ...extra];
  }

  if (tag === 'path') {
    const mergedLocal = mapPointsFromEditor(o.el, mergedEditor);
    o.el.setAttribute('d', buildPath(mergedLocal));
    o.data = { ...(o.data || {}), pts: mergedLocal };
    if (o.type === 'tube') {
      o.data.centerline = mergedLocal.map((p) => ({ x: p.x, y: p.y }));
    }
  } else {
    const mergedLocal = mapPointsFromEditor(o.el, mergedEditor);
    o.el.setAttribute('points', buildPointsAttr(mergedLocal));
    o.data = { ...(o.data || {}), pts: mergedLocal };
    if (tag === 'polyline' && mergedLocal.length >= 3 && near(mergedLocal[0], mergedLocal[mergedLocal.length - 1], 8)) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      [...o.el.attributes].forEach((attr) => poly.setAttribute(attr.name, attr.value));
      poly.setAttribute('points', buildPointsAttr(mergedLocal.slice(0, -1)));
      o.el.replaceWith(poly);
      o.el = poly;
      o.type = 'polygon';
    }
  }

  ctx.scene?.notifyGeometry([targetOid]);
  saveHistory();
  selectObj(targetOid);
  if (ctx.state.tool === 'node') showNodeHandles();
  return true;
}

/** Append a freehand stroke to a path endpoint (editor-space points). */
export function mergeFreehandIntoPath(targetOid, endpointIndex, rawPts) {
  if (!rawPts?.length) return false;
  const simplified =
    rawPts.length > 3
      ? smoothPencilPts(rawPts, 3)
      : rawPts.map((p) => ({ x: p.x, y: p.y }));
  return mergeStrokeIntoPath(targetOid, endpointIndex, simplified);
}
