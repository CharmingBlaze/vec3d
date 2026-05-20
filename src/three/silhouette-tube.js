import { THREE } from './setup.js';

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

function simplifyClosed(points, tolerance) {
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

  const closed = [...points, points[0]];
  const simplified = rdp(closed, 0, closed.length - 1);
  simplified.pop();
  return simplified.length >= 3 ? simplified : points;
}

function resampleClosed(points, count) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(len);
    total += len;
  }
  if (total <= 0) return points;

  const out = [];
  for (let s = 0; s < count; s++) {
    const target = (total * s) / count;
    let acc = 0;
    for (let i = 0; i < points.length; i++) {
      const len = lengths[i];
      if (acc + len >= target) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const t = len ? (target - acc) / len : 0;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        break;
      }
      acc += len;
    }
  }
  return out;
}

function addTopologyLine(topology, positions, a, b) {
  topology.push(
    positions[a * 3],
    positions[a * 3 + 1],
    positions[a * 3 + 2],
    positions[b * 3],
    positions[b * 3 + 1],
    positions[b * 3 + 2],
  );
}

function makeOutline(shape, opts) {
  const rawCount = Math.max(10, Math.min(48, opts.outlineSegments ?? 16));
  const source = shape.getSpacedPoints(rawCount * 2);
  if (source.length > 2) source.pop();
  const simplified = simplifyClosed(source, opts.simplify ?? 2.5);
  const count = Math.max(8, Math.min(rawCount, simplified.length * 2));
  const outline = resampleClosed(simplified, count);
  return polygonArea(outline) < 0 ? outline.reverse() : outline;
}

function horizontalSpanAt(outline, y) {
  const xs = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y || 1);
      xs.push(a.x + (b.x - a.x) * t);
    }
  }
  xs.sort((a, b) => a - b);
  if (xs.length >= 2) return { min: xs[0], max: xs[xs.length - 1] };

  let closest = outline[0];
  let best = Infinity;
  outline.forEach((p) => {
    const d = Math.abs(p.y - y);
    if (d < best) {
      best = d;
      closest = p;
    }
  });
  return { min: closest.x, max: closest.x };
}

/**
 * Filled low-poly rounded cage from a 2D silhouette.
 * This is intentionally not a border tube: it makes capped, filled topology.
 */
export function createRoundedSilhouetteGeometry(shape, depth, opts = {}) {
  const outline = makeOutline(shape, opts);
  if (outline.length < 3) return null;

  const bounds = boundsOf(outline);
  const rowCount = Math.max(8, Math.min(16, opts.rings ?? 10));
  const sideCount = Math.max(6, Math.min(12, Math.round((opts.outlineSegments ?? 16) / 2)));
  const positions = [];
  const indices = [];
  const topology = [];
  const rows = [];
  const maxRx = bounds.w / 2;
  const capInset = Math.min(0.035, Math.max(0.018, 0.28 / rowCount));
  const frontIndex = Math.round(sideCount / 4) % sideCount;
  const backIndex = Math.round((sideCount * 3) / 4) % sideCount;

  for (let row = 0; row < rowCount; row++) {
    const rawT = rowCount <= 1 ? 0.5 : row / (rowCount - 1);
    const easedT = 0.5 - Math.cos(rawT * Math.PI) / 2;
    const t = capInset + easedT * (1 - capInset * 2);
    const y = bounds.cy + bounds.h / 2 - bounds.h * t;
    const span = horizontalSpanAt(outline, y);
    const cx = (span.min + span.max) / 2;
    const rx = Math.max(0, (span.max - span.min) / 2);
    const capScale = Math.sin(Math.PI * t);
    const widthScale = Math.pow(Math.max(0, rx / maxRx), 0.28);
    const sphereScale = Math.pow(Math.max(0, capScale), 0.42);
    const zRadius = (depth / 2) * Math.max(0.22, Math.min(1, sphereScale * (0.9 + widthScale * 0.1)));
    const rowIndexes = [];

    if (rx < 0.5 || zRadius < 0.5) {
      const pole = positions.length / 3;
      positions.push(cx, y, 0);
      for (let i = 0; i < sideCount; i++) rowIndexes.push(pole);
    } else {
      for (let i = 0; i < sideCount; i++) {
        const a = (Math.PI * 2 * i) / sideCount;
        rowIndexes.push(positions.length / 3);
        positions.push(cx + Math.cos(a) * rx, y, Math.sin(a) * zRadius);
      }
    }
    rows.push(rowIndexes);
  }

  const topCenter = positions.length / 3;
  positions.push(
    rows[0].reduce((sum, i) => sum + positions[i * 3], 0) / sideCount,
    bounds.cy + bounds.h / 2,
    0,
  );
  const bottomRow = rows[rows.length - 1];
  const bottomCenter = positions.length / 3;
  positions.push(
    bottomRow.reduce((sum, i) => sum + positions[i * 3], 0) / sideCount,
    bounds.cy - bounds.h / 2,
    0,
  );

  for (let i = 0; i < sideCount; i++) {
    indices.push(topCenter, rows[0][(i + 1) % sideCount], rows[0][i]);
    indices.push(bottomCenter, bottomRow[i], bottomRow[(i + 1) % sideCount]);
  }

  for (let row = 0; row < rows.length - 1; row++) {
    const cur = rows[row];
    const next = rows[row + 1];
    for (let i = 0; i < sideCount; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % sideCount];
      const c = next[(i + 1) % sideCount];
      const d = next[i];
      if (a === b) indices.push(a, c, d);
      else if (c === d) indices.push(a, b, c);
      else indices.push(a, b, c, a, c, d);
    }
  }

  rows.forEach((row) => {
    const unique = new Set(row);
    if (unique.size <= 1) return;
    for (let i = 0; i < sideCount; i++) addTopologyLine(topology, positions, row[i], row[(i + 1) % sideCount]);
  });

  for (let i = 0; i < sideCount; i++) {
    for (let row = 0; row < rows.length - 1; row++) {
      const a = rows[row][i];
      const b = rows[row + 1][i];
      if (a !== b) addTopologyLine(topology, positions, a, b);
    }
  }

  addTopologyLine(topology, positions, topCenter, rows[0][frontIndex]);
  addTopologyLine(topology, positions, topCenter, rows[0][backIndex]);
  addTopologyLine(topology, positions, bottomCenter, bottomRow[frontIndex]);
  addTopologyLine(topology, positions, bottomCenter, bottomRow[backIndex]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.topologyPositions = topology;
  geo.userData.silhouetteSolid = true;
  return geo;
}
