import { ctx } from '../core/context.js';

/** CTM from element local space → canvas-group (editor) space */
export function getEditorCTM(el) {
  const elCTM = el.getCTM?.();
  const groupCTM = ctx.dom.canvasGroup?.getCTM?.();
  if (!elCTM || !groupCTM) return null;
  return groupCTM.inverse().multiply(elCTM);
}

export function mapToEditor(el, x, y) {
  const ctm = getEditorCTM(el);
  if (!ctm) return applyElementTransformFallback(el, x, y);
  const p = new DOMPoint(x, y).matrixTransform(ctm);
  return { x: p.x, y: p.y };
}

/** Bounding box in editor coordinates (includes element transform) */
export function getEditorBBox(el) {
  const ctm = getEditorCTM(el);
  const bb = el.getBBox();
  const corners = [
    [bb.x, bb.y],
    [bb.x + bb.width, bb.y],
    [bb.x + bb.width, bb.y + bb.height],
    [bb.x, bb.y + bb.height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  corners.forEach(([x, y]) => {
    const p = ctm ? new DOMPoint(x, y).matrixTransform(ctm) : applyElementTransformFallback(el, x, y);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** SVG editor coords → Three.js XY (centered, Y flipped) */
export function editorToThree(x, y, cx, cy) {
  return { x: x - cx, y: -(y - cy) };
}

export function mapToThree(el, x, y, cx, cy) {
  const p = mapToEditor(el, x, y);
  return editorToThree(p.x, p.y, cx, cy);
}

export function getSceneCenter(objs) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  objs.forEach((o) => {
    try {
      const bb = getEditorBBox(o.el);
      minX = Math.min(minX, bb.x);
      minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.width);
      maxY = Math.max(maxY, bb.y + bb.height);
    } catch {
      /* empty */
    }
  });
  if (!Number.isFinite(minX)) {
    return { cx: ctx.state.canvasW / 2, cy: ctx.state.canvasH / 2 };
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function readElementStyle(o) {
  const el = o.el;
  const fill = el.getAttribute('fill') ?? o.fill ?? '#888888';
  const stroke = el.getAttribute('stroke') ?? o.stroke ?? 'none';
  const sw = +(el.getAttribute('stroke-width') ?? o.sw ?? 1);
  const op = +(el.getAttribute('opacity') ?? o.op ?? 1);
  return { fill, stroke, sw, op };
}

function applyElementTransformFallback(el, x, y) {
  const m = parseSvgTransform(el.getAttribute('transform') || '');
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  };
}

function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrix(m1, m2) {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function translateMatrix(x = 0, y = 0) {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function scaleMatrix(x = 1, y = x) {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

function rotateMatrix(deg = 0) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

function skewXMatrix(deg = 0) {
  return { a: 1, b: 0, c: Math.tan((deg * Math.PI) / 180), d: 1, e: 0, f: 0 };
}

function skewYMatrix(deg = 0) {
  return { a: 1, b: Math.tan((deg * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
}

function parseTransformNumbers(raw) {
  return (raw.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number);
}

function parseSvgTransform(transform) {
  let matrix = identityMatrix();
  const re = /([a-zA-Z]+)\(([^)]*)\)/g;
  let match;

  while ((match = re.exec(transform)) !== null) {
    const fn = match[1].toLowerCase();
    const nums = parseTransformNumbers(match[2]);
    let next = identityMatrix();

    if (fn === 'matrix' && nums.length >= 6) {
      next = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] };
    } else if (fn === 'translate') {
      next = translateMatrix(nums[0] || 0, nums[1] || 0);
    } else if (fn === 'scale') {
      next = scaleMatrix(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1);
    } else if (fn === 'rotate') {
      const rot = rotateMatrix(nums[0] || 0);
      if (nums.length >= 3) {
        next = multiplyMatrix(
          multiplyMatrix(translateMatrix(nums[1], nums[2]), rot),
          translateMatrix(-nums[1], -nums[2]),
        );
      } else {
        next = rot;
      }
    } else if (fn === 'skewx') {
      next = skewXMatrix(nums[0] || 0);
    } else if (fn === 'skewy') {
      next = skewYMatrix(nums[0] || 0);
    }

    matrix = multiplyMatrix(matrix, next);
  }

  return matrix;
}
