import { mapToEditor } from './geometry.js';

/** Sample an SVG path element into editor-space points along its length. */
export function sampleSvgPath(el, step = 3) {
  if (!el?.getTotalLength) return null;
  try {
    const len = el.getTotalLength();
    if (len < 0.01) return null;
    const count = Math.max(24, Math.ceil(len / step));
    const pts = [];
    for (let i = 0; i < count; i++) {
      const at = el.getPointAtLength((len * i) / count);
      pts.push(mapToEditor(el, at.x, at.y));
    }
    return pts;
  } catch {
    return null;
  }
}

/** Whether a point list forms a closed loop (end meets start). */
export function isClosedLoop(pts, slack = 16) {
  if (!pts || pts.length < 4) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  const span = Math.max(maxX - minX, maxY - minY, 1);
  return Math.hypot(a.x - b.x, a.y - b.y) < Math.max(slack, span * 0.1);
}

export function parsePath(d) {
  const pts = [];
  const re = /([MLCQHVZmlcqhvz])([^MLCQHVZmlcqhvz]*)/g;
  let m;
  let px = 0;
  let py = 0;
  let mx = 0;
  let my = 0;

  while ((m = re.exec(d)) !== null) {
    const type = m[1];
    const abs = type === type.toUpperCase();
    const cmd = type.toUpperCase();
    const nums = (m[2].match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);

    if (cmd === 'M') {
      px = abs ? nums[0] : px + nums[0];
      py = abs ? nums[1] : py + nums[1];
      pts.push({ x: px, y: py });
      mx = px;
      my = py;
    } else if (cmd === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        px = abs ? nums[i] : px + nums[i];
        py = abs ? nums[i + 1] : py + nums[i + 1];
        pts.push({ x: px, y: py });
      }
    } else if (cmd === 'H') {
      for (let i = 0; i < nums.length; i++) {
        px = abs ? nums[i] : px + nums[i];
        pts.push({ x: px, y: py });
      }
    } else if (cmd === 'V') {
      for (let i = 0; i < nums.length; i++) {
        py = abs ? nums[i] : py + nums[i];
        pts.push({ x: px, y: py });
      }
    } else if (cmd === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        const c2x = abs ? nums[i] : px + nums[i];
        const c2y = abs ? nums[i + 1] : py + nums[i + 1];
        const c1x = abs ? nums[i + 2] : px + nums[i + 2];
        const c1y = abs ? nums[i + 3] : py + nums[i + 3];
        px = abs ? nums[i + 4] : px + nums[i + 4];
        py = abs ? nums[i + 5] : py + nums[i + 5];
        if (pts.length > 0) {
          const last = pts[pts.length - 1];
          last.c2x = c2x;
          last.c2y = c2y;
        }
        pts.push({ c1x, c1y, x: px, y: py });
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i < nums.length; i += 4) {
        const qx = abs ? nums[i] : px + nums[i];
        const qy = abs ? nums[i + 1] : py + nums[i + 1];
        if (pts.length > 0) {
          const last = pts[pts.length - 1];
          last.c2x = qx;
          last.c2y = qy;
        }
        px = abs ? nums[i + 2] : px + nums[i + 2];
        py = abs ? nums[i + 3] : py + nums[i + 3];
        pts.push({ c1x: qx, c1y: qy, x: px, y: py });
      }
    } else if (cmd === 'Z') {
      px = mx;
      py = my;
    }
  }
  return pts;
}

export function buildPath(pts, close = false) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (cur.c1x !== undefined || prev.c2x !== undefined) {
      const c1x = cur.c1x ?? cur.x;
      const c1y = cur.c1y ?? cur.y;
      const c2x = prev.c2x ?? prev.x;
      const c2y = prev.c2y ?? prev.y;
      d += ` C ${c2x} ${c2y} ${c1x} ${c1y} ${cur.x} ${cur.y}`;
    } else {
      d += ` L ${cur.x} ${cur.y}`;
    }
  }
  if (close) d += ' Z';
  return d;
}

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Dense polyline along a path with optional cubic handles (for tube centerlines). */
export function flattenPathPoints(pts, segmentsPerCurve = 8) {
  if (!pts.length) return [];
  if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y }];

  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const hasCurve = cur.c1x !== undefined || prev.c2x !== undefined;
    if (hasCurve) {
      const c2x = prev.c2x ?? prev.x;
      const c2y = prev.c2y ?? prev.y;
      const c1x = cur.c1x ?? cur.x;
      const c1y = cur.c1y ?? cur.y;
      for (let s = 1; s <= segmentsPerCurve; s++) {
        const t = s / segmentsPerCurve;
        out.push({
          x: cubicAt(prev.x, c2x, c1x, cur.x, t),
          y: cubicAt(prev.y, c2y, c1y, cur.y, t),
        });
      }
    } else {
      out.push({ x: cur.x, y: cur.y });
    }
  }
  return out;
}
