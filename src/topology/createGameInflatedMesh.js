import { THREE } from '../three/setup.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** @typedef {{ x: number, y: number }} Vec2 */

/**
 * Low-poly pillow blob — concentric quad ring loops, welded edge, Blender-friendly.
 */
export function createGameInflatedMesh(outline, options) {
  const samples = outline.length;
  if (samples < 3) return null;

  const rings = Math.max(2, Math.min(6, options.rings ?? 3));
  const halfDepth = options.depth * 0.52;
  const inflation = options.inflation ?? 0.72;
  const bevel = options.bevel ?? 0.12;
  const endRound = options.endRound ?? 0;
  const sideBands = Math.max(1, Math.min(2, options.sideLoops ?? 1));
  const innerRingStart = Math.max(0.12, Math.min(0.4, options.innerRingStart ?? 0.24));
  const evenRings = options.evenRings !== false;
  const mergeEpsilon = options.mergeEpsilon ?? 0.008;
  const loopDetail = options.loopDetail ?? 'simple';

  const center = ensureInteriorPoint(outline);
  const ccw = signedArea(outline) > 0;
  const bounds = boundsOf(outline);
  const uvScale = Math.max(bounds.w, bounds.h, 1);
  const rimRadius = halfDepth * inflation * Math.max(0.12, bevel * 0.44 + 0.1);
  const ringT = (r) => ringTForIndex(r, rings, innerRingStart, evenRings);

  const positions = [];
  const uvs = [];
  const indices = [];
  const frontAll = [];
  const backAll = [];
  const rimMidRings = [];

  for (let r = 0; r < rings; r++) {
    frontAll.push(positions.length / 3);
    appendRing(
      positions, uvs, outline, center, ringT(r),
      pillowHeight(ringT(r), halfDepth, inflation, endRound, rimRadius), uvScale,
    );
  }

  const frontCenterIdx = positions.length / 3;
  const frontPeakZ = pillowHeight(0, halfDepth, inflation, endRound, rimRadius);
  positions.push(center.x, center.y, frontPeakZ);
  uvs.push(0.5, 0.5);

  for (let r = 0; r < rings; r++) {
    backAll.push(positions.length / 3);
    appendRing(
      positions, uvs, outline, center, ringT(r),
      -pillowHeight(ringT(r), halfDepth, inflation, endRound, rimRadius), uvScale, true,
    );
  }

  const backCenterIdx = positions.length / 3;
  positions.push(center.x, center.y, -frontPeakZ);
  uvs.push(0.5, 0.5);

  const frontEdgeRing = frontAll[frontAll.length - 1];
  const backEdgeRing = backAll[backAll.length - 1];

  for (let s = 1; s <= sideBands; s++) {
    const u = s / (sideBands + 1);
    rimMidRings.push(positions.length / 3);
    appendOutlineRing(positions, uvs, outline, rimRadius * Math.cos(u * Math.PI), uvScale);
  }

  for (let r = 0; r < frontAll.length - 1; r++) {
    connectRings(indices, frontAll[r], frontAll[r + 1], samples, false, ccw);
  }
  for (let r = 0; r < backAll.length - 1; r++) {
    connectRings(indices, backAll[r], backAll[r + 1], samples, true, ccw);
  }

  connectCenterCap(indices, frontCenterIdx, frontAll[0], samples, ccw, false);
  connectCenterCap(indices, backCenterIdx, backAll[0], samples, ccw, true);

  if (rimMidRings.length) {
    connectRings(indices, frontEdgeRing, rimMidRings[0], samples, false, ccw);
    for (let s = 0; s < rimMidRings.length - 1; s++) {
      connectRings(indices, rimMidRings[s], rimMidRings[s + 1], samples, false, ccw);
    }
    connectRings(indices, rimMidRings[rimMidRings.length - 1], backEdgeRing, samples, false, ccw);
  } else {
    connectRings(indices, frontEdgeRing, backEdgeRing, samples, false, ccw);
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry = mergeVertices(geometry, mergeEpsilon);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.gameMesh = true;
  geometry.userData.doodleSolid = true;
  geometry.userData.topologyMeta = {
    boundaryPoints: samples,
    rings,
    sideBands,
    quadStrips: true,
    preset: options.topoPreset ?? 'blender-edit',
  };
  geometry.userData.topologyPositions = buildLoopOverlay(
    positions, frontAll, backAll, rimMidRings, frontEdgeRing, frontCenterIdx, backCenterIdx, samples, loopDetail,
  );
  return geometry;
}

function pillowHeight(ringT, halfDepth, inflation, endRound, rimRadius) {
  const radial = Math.max(0, 1 - ringT * ringT);
  let h = Math.pow(Math.sqrt(radial), 0.86);

  if (endRound > 0.01) {
    const flat = endRound * 0.32;
    if (ringT < flat) {
      const blend = 1 - ringT / flat;
      h = lerp(h, Math.max(h, 0.58), blend * 0.15);
    }
  }

  const dome = halfDepth * inflation * h;
  const edgeBlend = THREE.MathUtils.smoothstep(ringT, 0.9, 1);
  return lerp(dome, rimRadius, edgeBlend);
}

function ringTForIndex(r, rings, innerStart, evenRings) {
  if (r === 0) return innerStart;
  const u = r / (rings - 1);
  if (evenRings) return lerp(innerStart, 1, u);
  return lerp(innerStart, 1, Math.pow(u, 0.55));
}

function buildLoopOverlay(
  positions, frontAll, backAll, rimMidRings, frontEdge, frontCenter, backCenter, samples, detail,
) {
  const lines = [];
  const addRing = (start) => {
    for (let i = 0; i < samples; i++) {
      const a = (start + i) * 3;
      const b = (start + ((i + 1) % samples)) * 3;
      lines.push(
        positions[a], positions[a + 1], positions[a + 2],
        positions[b], positions[b + 1], positions[b + 2],
      );
    }
  };
  const addSegment = (fromIdx, toIdx) => {
    const a = fromIdx * 3;
    const b = toIdx * 3;
    lines.push(
      positions[a], positions[a + 1], positions[a + 2],
      positions[b], positions[b + 1], positions[b + 2],
    );
  };

  if (detail === 'full') {
    frontAll.forEach(addRing);
    backAll.forEach(addRing);
    rimMidRings.forEach(addRing);

    const meridians = Math.max(4, Math.min(8, Math.floor(samples / 4)));
    const step = Math.max(1, Math.floor(samples / meridians));
    const backEdge = backAll[backAll.length - 1];
    const equator = rimMidRings.length
      ? rimMidRings[Math.floor(rimMidRings.length / 2)]
      : null;

    for (let i = 0; i < samples; i += step) {
      addSegment(frontCenter, frontAll[0] + i);
      for (let r = 0; r < frontAll.length - 1; r++) {
        addSegment(frontAll[r] + i, frontAll[r + 1] + i);
      }

      addSegment(backCenter, backAll[0] + i);
      for (let r = 0; r < backAll.length - 1; r++) {
        addSegment(backAll[r] + i, backAll[r + 1] + i);
      }

      if (equator !== null) {
        addSegment(frontEdge + i, equator + i);
        addSegment(equator + i, backEdge + i);
      }
    }
    return lines;
  }

  addRing(frontEdge);
  if (frontAll.length > 1) addRing(frontAll[Math.floor(frontAll.length / 2)]);
  if (backAll.length > 1) addRing(backAll[Math.floor(backAll.length / 2)]);
  rimMidRings.forEach(addRing);

  const step = Math.max(1, Math.floor(samples / 4));
  const equator = rimMidRings.length
    ? rimMidRings[Math.floor(rimMidRings.length / 2)]
    : frontEdge;
  for (let i = 0; i < samples; i += step) {
    addSegment(frontEdge + i, equator + i);
  }

  return lines;
}

function appendRing(positions, uvs, outline, center, ringT, z, uvScale, flipY = false) {
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    const x = lerp(center.x, p.x, ringT);
    const y = lerp(center.y, p.y, ringT);
    positions.push(x, y, z);
    const u = 0.5 + (x - center.x) / uvScale;
    const v = 0.5 + (y - center.y) / uvScale;
    uvs.push(u, flipY ? 1 - v : v);
  }
}

function appendOutlineRing(positions, uvs, outline, z, uvScale, flipY = false) {
  const c = averagePoint(outline);
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    positions.push(p.x, p.y, z);
    const u = 0.5 + (p.x - c.x) / uvScale;
    const v = 0.5 + (p.y - c.y) / uvScale;
    uvs.push(u, flipY ? 1 - v : v);
  }
}

function connectCenterCap(indices, centerIdx, ringStart, samples, ccw, isBack) {
  for (let i = 0; i < samples; i++) {
    const a = ringStart + i;
    const b = ringStart + ((i + 1) % samples);
    if (isBack) {
      indices.push(centerIdx, ccw ? b : a, ccw ? a : b);
    } else {
      indices.push(centerIdx, ccw ? a : b, ccw ? b : a);
    }
  }
}

function connectRings(indices, innerStart, outerStart, samples, reverse, ccw) {
  for (let i = 0; i < samples; i++) {
    const a = innerStart + i;
    const b = innerStart + ((i + 1) % samples);
    const c = outerStart + i;
    const d = outerStart + ((i + 1) % samples);
    if (!reverse) {
      if (ccw) {
        indices.push(a, c, b);
        indices.push(b, c, d);
      } else {
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    } else if (ccw) {
      indices.push(a, b, c);
      indices.push(b, d, c);
    } else {
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }
}

function polygonCentroid(points) {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-8) return averagePoint(points);
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function averagePoint(points) {
  let x = 0;
  let y = 0;
  points.forEach((p) => {
    x += p.x;
    y += p.y;
  });
  return { x: x / points.length, y: y / points.length };
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function ensureInteriorPoint(outline) {
  const bounds = boundsOf(outline);
  const candidates = [
    polygonCentroid(outline),
    averagePoint(outline),
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
  ];
  for (const c of candidates) {
    if (pointInPolygon(c, outline)) return c;
  }
  return candidates[0];
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
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
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
