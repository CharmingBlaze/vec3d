import { THREE } from './setup.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerRegular from 'three/examples/fonts/helvetiker_regular.typeface.json';
import { ctx } from '../core/context.js';
import { mapToThree, getEditorBBox } from '../svg/geometry.js';

const svgLoader = new SVGLoader();
const font = new FontLoader().parse(helvetikerRegular);

function detailSegments() {
  const build = ctx.d3BuildContext;
  const raw = build?.cseg ?? +(ctx.dom?.d3Cseg?.value || 8);
  const profile = build?.profile ?? ctx.dom?.d3Profile?.value;
  const endRound = build?.round ?? +(ctx.dom?.d3Round?.value || 0);
  let max = profile === 'game' ? 6 : 32;
  if (endRound > 0 || profile === 'capsule' || profile === 'tube') max = Math.max(max, 24);
  return Math.max(3, Math.min(max, raw));
}

function simplificationTolerance() {
  const build = ctx.d3BuildContext;
  const profile = build?.profile ?? ctx.dom?.d3Profile?.value;
  const endRound = build?.round ?? +(ctx.dom?.d3Round?.value || 0);
  if (endRound > 0 || profile === 'capsule' || profile === 'tube') return 1;
  return profile === 'game' ? 4 : 1.5;
}

function simplifyPoints(points, tolerance = 1.5) {
  if (points.length < 4 || tolerance <= 0) return points;

  const dist = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };

  const rdp = (pts, start, end) => {
    let maxDist = 0;
    let split = start;
    for (let i = start + 1; i < end; i++) {
      const d = dist(pts[i], pts[start], pts[end]);
      if (d > maxDist) {
        maxDist = d;
        split = i;
      }
    }
    if (maxDist > tolerance) {
      return [...rdp(pts, start, split), ...rdp(pts, split, end).slice(1)];
    }
    return [pts[start], pts[end]];
  };

  return rdp(points, 0, points.length - 1);
}

/** Build THREE.Shape(s) from an SVG element in editor space → Three.js centered coords */
export function elemToThreeShapes(el, cx, cy) {
  const tag = el.tagName.toLowerCase();

  if (tag === 'path') {
    return shapesFromPath(el, cx, cy);
  }
  if (tag === 'text') {
    return shapesFromText(el, cx, cy);
  }

  const shape = primitiveToShape(el, cx, cy);
  return shape ? [fixShapeWinding(shape)] : [];
}

function isCompoundPath(d) {
  return (d.match(/[Mm]/g) || []).length > 1;
}

/** Prefer direct path parsing (keeps beziers); SVGLoader only for compound paths */
function shapesFromPath(el, cx, cy) {
  const d = el.getAttribute('d');
  if (!d) return [];

  if (!isCompoundPath(d)) {
    const shape = pathDToShape(d, el, cx, cy);
    if (shape) return [fixShapeWinding(shape)];
  }

  return shapesFromSvgLoader(el, cx, cy);
}

function shapesFromSvgLoader(el, cx, cy) {
  try {
    const wrap = `<svg xmlns="http://www.w3.org/2000/svg">${el.outerHTML}</svg>`;
    const { paths } = svgLoader.parse(wrap);
    const out = [];
    paths.forEach((path) => {
      const created = SVGLoader.createShapes(path);
      created.forEach((shape) => {
        const adjusted = recenterShape(shape, el, cx, cy);
        if (adjusted) out.push(adjusted);
      });
    });
    if (out.length) return out;
  } catch (err) {
    console.warn('SVGLoader fallback:', err);
  }
  const d = el.getAttribute('d');
  if (!d) return [];
  const s = pathDToShape(d, el, cx, cy);
  return s ? [fixShapeWinding(s)] : [];
}

/** Ensure CCW outer winding for ExtrudeGeometry (Y-up Three.js space) */
function fixShapeWinding(shape) {
  const pts = shape.getPoints(detailSegments() * 2);
  if (pts.length < 3) return shape;
  if (!THREE.ShapeUtils.isClockWise(pts)) return shape;

  const rev = new THREE.Shape();
  for (let i = pts.length - 1; i >= 0; i--) {
    if (i === pts.length - 1) rev.moveTo(pts[i].x, pts[i].y);
    else rev.lineTo(pts[i].x, pts[i].y);
  }
  rev.closePath();
  rev.holes = shape.holes || [];
  return rev;
}

/**
 * SVGLoader points are Y-flipped relative to SVG; undo flip before mapToThree.
 * Sample at high resolution since SVGLoader output is used for compound paths only.
 */
function recenterShape(shape, el, cx, cy) {
  const points = simplifyPoints(shape.getPoints(detailSegments() * 4), simplificationTolerance());
  if (!points.length) return null;
  const newShape = new THREE.Shape();
  points.forEach((pt, i) => {
    const mapped = mapToThree(el, pt.x, -pt.y, cx, cy);
    if (i === 0) newShape.moveTo(mapped.x, mapped.y);
    else newShape.lineTo(mapped.x, mapped.y);
  });
  newShape.closePath();

  shape.holes?.forEach((hole) => {
    const holePts = simplifyPoints(hole.getPoints(detailSegments() * 4), simplificationTolerance());
    if (holePts.length < 3) return;
    const holePath = new THREE.Path();
    holePts.forEach((pt, i) => {
      const mapped = mapToThree(el, pt.x, -pt.y, cx, cy);
      if (i === 0) holePath.moveTo(mapped.x, mapped.y);
      else holePath.lineTo(mapped.x, mapped.y);
    });
    holePath.closePath();
    newShape.holes.push(holePath);
  });

  return fixShapeWinding(newShape);
}

function pathDToShape(d, el, cx, cy) {
  const shape = new THREE.Shape();
  const re = /([MLCQTSAZmlcqtsahvz])([^MLCQTSAZmlcqtsahvz]*)/g;
  let m;
  let px = 0;
  let py = 0;
  let mx = 0;
  let my = 0;
  let started = false;
  let closed = false;
  let lastC2 = null;
  let lastQ = null;
  let lastCmd = '';

  while ((m = re.exec(d)) !== null) {
    const type = m[1];
    const nums = (m[2].match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
    const abs = type === type.toUpperCase();
    const cmd = type.toUpperCase();

    const emit = (x, y) => {
      const p = mapToThree(el, x, y, cx, cy);
      if (!started) {
        shape.moveTo(p.x, p.y);
        started = true;
      } else {
        shape.lineTo(p.x, p.y);
      }
    };

    switch (cmd) {
      case 'M':
        px = abs ? nums[0] : px + nums[0];
        py = abs ? nums[1] : py + nums[1];
        emit(px, py);
        mx = px;
        my = py;
        for (let i = 2; i < nums.length; i += 2) {
          px = abs ? nums[i] : px + nums[i];
          py = abs ? nums[i + 1] : py + nums[i + 1];
          emit(px, py);
        }
        lastC2 = null;
        lastQ = null;
        break;
      case 'L':
        for (let i = 0; i < nums.length; i += 2) {
          px = abs ? nums[i] : px + nums[i];
          py = abs ? nums[i + 1] : py + nums[i + 1];
          emit(px, py);
        }
        lastC2 = null;
        lastQ = null;
        break;
      case 'H':
        for (let i = 0; i < nums.length; i++) {
          px = abs ? nums[i] : px + nums[i];
          emit(px, py);
        }
        lastC2 = null;
        lastQ = null;
        break;
      case 'V':
        for (let i = 0; i < nums.length; i++) {
          py = abs ? nums[i] : py + nums[i];
          emit(px, py);
        }
        lastC2 = null;
        lastQ = null;
        break;
      case 'C':
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = abs ? nums[i] : px + nums[i];
          const y1 = abs ? nums[i + 1] : py + nums[i + 1];
          const x2 = abs ? nums[i + 2] : px + nums[i + 2];
          const y2 = abs ? nums[i + 3] : py + nums[i + 3];
          px = abs ? nums[i + 4] : px + nums[i + 4];
          py = abs ? nums[i + 5] : py + nums[i + 5];
          const p1 = mapToThree(el, x1, y1, cx, cy);
          const p2 = mapToThree(el, x2, y2, cx, cy);
          const p3 = mapToThree(el, px, py, cx, cy);
          if (!started) {
            shape.moveTo(p3.x, p3.y);
            started = true;
          } else {
            shape.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          }
          lastC2 = { x: x2, y: y2 };
          lastQ = null;
        }
        break;
      case 'S':
        for (let i = 0; i < nums.length; i += 4) {
          const reflected = lastCmd === 'C' || lastCmd === 'S'
            ? { x: px * 2 - lastC2.x, y: py * 2 - lastC2.y }
            : { x: px, y: py };
          const x2 = abs ? nums[i] : px + nums[i];
          const y2 = abs ? nums[i + 1] : py + nums[i + 1];
          px = abs ? nums[i + 2] : px + nums[i + 2];
          py = abs ? nums[i + 3] : py + nums[i + 3];
          const p1 = mapToThree(el, reflected.x, reflected.y, cx, cy);
          const p2 = mapToThree(el, x2, y2, cx, cy);
          const p3 = mapToThree(el, px, py, cx, cy);
          if (!started) {
            shape.moveTo(p3.x, p3.y);
            started = true;
          } else {
            shape.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          }
          lastC2 = { x: x2, y: y2 };
          lastQ = null;
        }
        break;
      case 'Q':
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = abs ? nums[i] : px + nums[i];
          const y1 = abs ? nums[i + 1] : py + nums[i + 1];
          px = abs ? nums[i + 2] : px + nums[i + 2];
          py = abs ? nums[i + 3] : py + nums[i + 3];
          const p1 = mapToThree(el, x1, y1, cx, cy);
          const p2 = mapToThree(el, px, py, cx, cy);
          if (!started) shape.moveTo(p2.x, p2.y);
          else shape.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
          started = true;
          lastQ = { x: x1, y: y1 };
          lastC2 = null;
        }
        break;
      case 'T':
        for (let i = 0; i < nums.length; i += 2) {
          const reflected = lastCmd === 'Q' || lastCmd === 'T'
            ? { x: px * 2 - lastQ.x, y: py * 2 - lastQ.y }
            : { x: px, y: py };
          px = abs ? nums[i] : px + nums[i];
          py = abs ? nums[i + 1] : py + nums[i + 1];
          const p1 = mapToThree(el, reflected.x, reflected.y, cx, cy);
          const p2 = mapToThree(el, px, py, cx, cy);
          if (!started) shape.moveTo(p2.x, p2.y);
          else shape.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
          started = true;
          lastQ = reflected;
          lastC2 = null;
        }
        break;
      case 'Z':
        closed = true;
        shape.closePath();
        px = mx;
        py = my;
        lastC2 = null;
        lastQ = null;
        break;
      case 'A': {
        for (let i = 0; i < nums.length; i += 7) {
          const rx = nums[i];
          const ry = nums[i + 1];
          const rot = nums[i + 2];
          const large = !!nums[i + 3];
          const sweep = !!nums[i + 4];
          const ex = abs ? nums[i + 5] : px + nums[i + 5];
          const ey = abs ? nums[i + 6] : py + nums[i + 6];
          arcToPoints(px, py, rx, ry, rot, large, sweep, ex, ey)
            .slice(1)
            .forEach((pt) => emit(pt.x, pt.y));
          px = ex;
          py = ey;
        }
        lastC2 = null;
        lastQ = null;
        break;
      }
      default:
        break;
    }
    lastCmd = cmd;
  }
  if (started && !closed && Math.hypot(px - mx, py - my) < 8) {
    shape.closePath();
  }
  return started ? shape : null;
}

function arcToPoints(x1, y1, rxIn, ryIn, xAxisRotation, largeArcFlag, sweepFlag, x2, y2) {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const coef = sign * Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2)));
  const cxp = coef * (rx * y1p) / ry;
  const cyp = coef * (-ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    const a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  let start = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweepFlag && delta > 0) delta -= Math.PI * 2;
  if (sweepFlag && delta < 0) delta += Math.PI * 2;

  const steps = Math.max(4, Math.ceil((Math.abs(delta) / (Math.PI * 2)) * detailSegments() * 2));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (delta * i) / steps;
    const x = cx + cosPhi * rx * Math.cos(a) - sinPhi * ry * Math.sin(a);
    const y = cy + sinPhi * rx * Math.cos(a) + cosPhi * ry * Math.sin(a);
    pts.push({ x, y });
  }
  return pts;
}

function primitiveToShape(el, cx, cy) {
  const tag = el.tagName.toLowerCase();
  const shape = new THREE.Shape();

  if (tag === 'rect') {
    const x = +el.getAttribute('x') || 0;
    const y = +el.getAttribute('y') || 0;
    const w = +el.getAttribute('width') || 0;
    const h = +el.getAttribute('height') || 0;
    const rx = +el.getAttribute('rx') || +el.getAttribute('ry') || 0;
    if (rx > 0) {
      return roundedRectShape(el, x, y, w, h, rx, cx, cy);
    }
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    pts.forEach(([px, py], i) => {
      const p = mapToThree(el, px, py, cx, cy);
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    });
    shape.closePath();
    return shape;
  }

  if (tag === 'ellipse' || tag === 'circle') {
    const ecx = +el.getAttribute('cx') || 0;
    const ecy = +el.getAttribute('cy') || 0;
    const rx = +el.getAttribute('rx') || +el.getAttribute('r') || 0;
    const ry = +el.getAttribute('ry') || +el.getAttribute('r') || 0;
    const segs = Math.max(8, detailSegments() * 2);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const p = mapToThree(el, ecx + Math.cos(a) * rx, ecy + Math.sin(a) * ry, cx, cy);
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    }
    shape.closePath();
    return shape;
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    if (pts.length < 4) return null;
    if (tag === 'polyline') {
      return thickPolylineShape(el, pts, cx, cy);
    }
    for (let i = 0; i < pts.length; i += 2) {
      const p = mapToThree(el, pts[i], pts[i + 1], cx, cy);
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    }
    shape.closePath();
    return shape;
  }

  if (tag === 'line') {
    const x1 = +el.getAttribute('x1') || 0;
    const y1 = +el.getAttribute('y1') || 0;
    const x2 = +el.getAttribute('x2') || 0;
    const y2 = +el.getAttribute('y2') || 0;
    const sw = +el.getAttribute('stroke-width') || 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sw * 0.5;
    const ny = (dx / len) * sw * 0.5;
    const quad = [
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny],
    ];
    quad.forEach(([px, py], i) => {
      const p = mapToThree(el, px, py, cx, cy);
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    });
    shape.closePath();
    return shape;
  }

  return null;
}

function roundedRectShape(el, x, y, w, h, rx, cx, cy) {
  const shape = new THREE.Shape();
  const ry = +el.getAttribute('ry') || rx;
  const r = Math.min(rx, w / 2);
  const yr = Math.min(ry, h / 2);
  const move = (px, py) => {
    const p = mapToThree(el, px, py, cx, cy);
    shape.moveTo(p.x, p.y);
  };
  const line = (px, py) => {
    const p = mapToThree(el, px, py, cx, cy);
    shape.lineTo(p.x, p.y);
  };
  const quad = (cpx, cpy, px, py) => {
    const cp = mapToThree(el, cpx, cpy, cx, cy);
    const p = mapToThree(el, px, py, cx, cy);
    shape.quadraticCurveTo(cp.x, cp.y, p.x, p.y);
  };
  move(x + r, y);
  line(x + w - r, y);
  quad(x + w, y, x + w, y + yr);
  line(x + w, y + h - yr);
  quad(x + w, y + h, x + w - r, y + h);
  line(x + r, y + h);
  quad(x, y + h, x, y + h - yr);
  line(x, y + yr);
  quad(x, y, x + r, y);
  shape.closePath();
  return shape;
}

function thickPolylineShape(el, nums, cx, cy) {
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  if (pts.length < 2) return null;
  const sw = +el.getAttribute('stroke-width') || 2;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sw * 0.5;
    const ny = (dx / len) * sw * 0.5;
    left.push([pts[i].x + nx, pts[i].y + ny]);
    right.push([pts[i].x - nx, pts[i].y - ny]);
  }
  const outline = [...left, ...right.reverse()];
  const shape = new THREE.Shape();
  outline.forEach(([px, py], i) => {
    const p = mapToThree(el, px, py, cx, cy);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

function shapesFromText(el, cx, cy) {
  const text = (el.textContent || '').trim();
  if (!text) return [];

  const x = +el.getAttribute('x') || 0;
  const y = +el.getAttribute('y') || 0;
  const fs = +el.getAttribute('font-size') || 24;
  const rawShapes = font.generateShapes(text, fs);

  return rawShapes.map((shape) => {
    const mapped = new THREE.Shape();
    shape.curves.forEach((curve, i) => {
      appendMappedCurve(mapped, curve, el, x, y, cx, cy, i === 0);
    });
    shape.holes?.forEach((hole) => {
      const mappedHole = new THREE.Path();
      hole.curves.forEach((curve, i) => {
        appendMappedCurve(mappedHole, curve, el, x, y, cx, cy, i === 0);
      });
      mapped.holes.push(mappedHole);
    });
    return fixShapeWinding(mapped);
  });
}

function mapTextPoint(el, baseX, baseY, pt, cx, cy) {
  return mapToThree(el, baseX + pt.x, baseY - pt.y, cx, cy);
}

function appendMappedCurve(path, curve, el, baseX, baseY, cx, cy, moveFirst = false) {
  const start = mapTextPoint(el, baseX, baseY, curve.getPoint(0), cx, cy);
  if (moveFirst) path.moveTo(start.x, start.y);

  const end = mapTextPoint(el, baseX, baseY, curve.getPoint(1), cx, cy);
  if (curve.isLineCurve) {
    path.lineTo(end.x, end.y);
    return;
  }
  if (curve.isQuadraticBezierCurve) {
    const cp = mapTextPoint(el, baseX, baseY, curve.v1, cx, cy);
    path.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
    return;
  }
  if (curve.isCubicBezierCurve) {
    const cp1 = mapTextPoint(el, baseX, baseY, curve.v1, cx, cy);
    const cp2 = mapTextPoint(el, baseX, baseY, curve.v2, cx, cy);
    path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    return;
  }

  path.lineTo(end.x, end.y);
}
