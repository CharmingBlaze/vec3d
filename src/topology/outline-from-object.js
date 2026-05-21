import { mapToEditor } from '../svg/geometry.js';
import { parsePath, flattenPathPoints, sampleSvgPath } from '../svg/path.js';

/** @typedef {{ x: number, y: number }} Vec2 */

function pathIsClosed(o) {
  if (o.data?.closed) return true;
  const d = (o.el?.getAttribute('d') || '').trim();
  return /[zZ]\s*$/.test(d);
}

/** Dense polyline outline in editor space — input to topology prep, not final mesh. */
export function extractRawOutlineFromObject(o) {
  const el = o?.el;
  if (!el) return [];

  const tag = el.tagName?.toLowerCase();

  if (tag === 'polygon') {
    const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const p = mapToEditor(el, nums[i], nums[i + 1]);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  if (tag === 'rect') {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    return [
      mapToEditor(el, x, y),
      mapToEditor(el, x + w, y),
      mapToEditor(el, x + w, y + h),
      mapToEditor(el, x, y + h),
    ];
  }

  if (tag === 'ellipse' || tag === 'circle') {
    const cx = +el.getAttribute('cx') || 0;
    const cy = +el.getAttribute('cy') || 0;
    const rx = +el.getAttribute('rx') || +el.getAttribute('r') || 0;
    const ry = +el.getAttribute('ry') || +el.getAttribute('r') || 0;
    const segs = 24;
    const out = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      out.push(mapToEditor(el, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
    }
    return out;
  }

  if (tag === 'path' && el.isConnected) {
    const sampled = sampleSvgPath(el, 4);
    if (sampled?.length >= 3) return sampled;
  }

  if (o.data?.pts?.length >= 3) {
    const pts = o.data.pts.map((p) => mapToEditor(el, p.x, p.y));
    const hasHandles = o.data.pts.some((p) => p.c1x !== undefined || p.c2x !== undefined);
    if (hasHandles) return flattenPathPoints(o.data.pts, 6).map((p) => mapToEditor(el, p.x, p.y));
    return pts;
  }

  if (tag === 'path') {
    const pts = parsePath(el.getAttribute('d') || '');
    if (pts.length >= 3) {
      const hasHandles = pts.some((p) => p.c1x !== undefined || p.c2x !== undefined);
      if (hasHandles) return flattenPathPoints(pts, 6);
      return pts.map((p) => ({ x: p.x, y: p.y }));
    }
  }

  if (o.data?.centerline?.length >= 3) {
    return o.data.centerline.map((p) => mapToEditor(el, p.x, p.y));
  }

  if (o.data?.meshOutline?.length >= 3) {
    return o.data.meshOutline.map((p) => ({ x: p.x, y: p.y }));
  }

  return [];
}

export function isClosedFilledOutline(o, style) {
  const hasFill = style?.fill && style.fill !== 'none' && style.fill !== 'transparent';
  if (!hasFill) return false;
  return pathIsClosed(o) || o.data?.closed === true;
}
