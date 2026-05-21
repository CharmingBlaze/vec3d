/** @typedef {{ x: number, y: number }} Vec2 */

/** @typedef {import('./topology-settings.js').PrepareOutlineOptions} PrepareOutlineOptions */

/**
 * @typedef {Object} PreparedOutline
 * @property {Vec2[]} raw
 * @property {Vec2[]} cleaned
 * @property {Vec2[]} simplified
 * @property {Vec2[]} resampled
 * @property {number[]} corners
 * @property {boolean} isClockwise
 * @property {boolean} isValid
 * @property {string[]} warnings
 */

export function prepareOutlineForMeshing(rawPoints, options) {
  const warnings = [];
  let cleaned = removeDuplicateAndTinySegments(rawPoints, options.minPointDistance);

  if (cleaned.length < 3) {
    return {
      raw: rawPoints,
      cleaned,
      simplified: cleaned,
      resampled: cleaned,
      corners: [],
      isClockwise: false,
      isValid: false,
      warnings: ['Not enough points to create a closed mesh.'],
    };
  }

  cleaned = closeOutlineIfNeeded(cleaned);

  let simplified = simplifyRDP(cleaned, options.simplifyTolerance);
  if (simplified.length < 3) {
    simplified = cleaned;
    warnings.push('Simplification was too aggressive. Reverted to cleaned outline.');
  }

  const corners = options.preserveCorners
    ? detectCorners(simplified, options.cornerAngleThresholdDeg)
    : [];

  let smoothed = simplified;
  for (let i = 0; i < options.smoothPasses; i++) {
    smoothed = smoothOutlinePreserveCorners(smoothed, corners, 0.35);
  }

  const resampled = resampleClosedOutline(smoothed, options.targetPointCount);
  const isClockwise = polygonArea(resampled) < 0;
  const finalOutline = isClockwise ? resampled : [...resampled].reverse();

  return {
    raw: rawPoints,
    cleaned,
    simplified,
    resampled: finalOutline,
    corners,
    isClockwise: true,
    isValid: finalOutline.length >= 3,
    warnings,
  };
}

function removeDuplicateAndTinySegments(points, minDistance) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last) {
      result.push({ x: point.x, y: point.y });
      continue;
    }
    if (distance(point, last) >= minDistance) {
      result.push({ x: point.x, y: point.y });
    }
  }
  return result;
}

function closeOutlineIfNeeded(points) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (distance(first, last) < 0.001) return points.slice(0, -1);
  return points;
}

function simplifyRDP(points, tolerance) {
  if (points.length <= 3) return points;
  const closed = [...points, points[0]];
  const simplifiedOpen = rdpRecursive(closed, tolerance);
  if (simplifiedOpen.length > 1) simplifiedOpen.pop();
  return simplifiedOpen;
}

function rdpRecursive(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }
  if (maxDist > epsilon) {
    return rdpRecursive(points.slice(0, index + 1), epsilon)
      .slice(0, -1)
      .concat(rdpRecursive(points.slice(index), epsilon));
  }
  return [start, end];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) return distance(point, lineStart);
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x,
  );
  return numerator / Math.sqrt(dx * dx + dy * dy);
}

function detectCorners(points, thresholdDeg) {
  const corners = [];
  const thresholdRad = (thresholdDeg * Math.PI) / 180;
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const a = normalize2({ x: prev.x - curr.x, y: prev.y - curr.y });
    const b = normalize2({ x: next.x - curr.x, y: next.y - curr.y });
    const dot = clamp(a.x * b.x + a.y * b.y, -1, 1);
    if (Math.acos(dot) < thresholdRad) corners.push(i);
  }
  return corners;
}

function smoothOutlinePreserveCorners(points, cornerIndices, amount) {
  const cornerSet = new Set(cornerIndices);
  const result = [];
  for (let i = 0; i < points.length; i++) {
    if (cornerSet.has(i)) {
      result.push(points[i]);
      continue;
    }
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const avg = {
      x: (prev.x + curr.x + next.x) / 3,
      y: (prev.y + curr.y + next.y) / 3,
    };
    result.push({
      x: lerp(curr.x, avg.x, amount),
      y: lerp(curr.y, avg.y, amount),
    });
  }
  return result;
}

function resampleClosedOutline(points, targetCount) {
  const distances = [0];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    total += distance(points[i], points[(i + 1) % points.length]);
    distances.push(total);
  }
  if (total <= 0) return points;

  const result = [];
  for (let i = 0; i < targetCount; i++) {
    const target = (i / targetCount) * total;
    let segment = 0;
    while (segment < distances.length - 1 && distances[segment + 1] < target) segment++;
    const a = points[segment % points.length];
    const b = points[(segment + 1) % points.length];
    const startDistance = distances[segment];
    const endDistance = distances[segment + 1];
    const t = (target - startDistance) / Math.max(0.00001, endDistance - startDistance);
    result.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  }
  return result;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function normalize2(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 0.00001) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
