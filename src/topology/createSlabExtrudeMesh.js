import { THREE } from '../three/setup.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** @typedef {{ x: number, y: number }} Vec2 */

/**
 * Low-poly flat extrude — front/back caps + clean vertical quad walls.
 * No radial center fan; caps use ear-style triangulation.
 */
export function createSlabExtrudeMesh(outline, options) {
  const samples = outline.length;
  if (samples < 3) return null;

  const halfDepth = options.depth * 0.5;
  const bevelNorm = Math.max(0, options.bevel ?? 0);
  const mergeEpsilon = options.mergeEpsilon ?? 0.004;
  const loopDetail = options.loopDetail ?? 'full';

  const ccw = signedArea(outline) > 0;
  const bounds = boundsOf(outline);
  const uvScale = Math.max(bounds.w, bounds.h, 1);
  const center = averagePoint(outline);

  const bevelH = bevelNorm > 0.01
    ? Math.min(halfDepth * 0.35, halfDepth * bevelNorm * 0.55)
    : 0;
  const topZ = halfDepth;
  const bottomZ = -halfDepth;
  const topWallZ = topZ - bevelH;
  const bottomWallZ = bottomZ + bevelH;

  const positions = [];
  const uvs = [];
  const indices = [];

  const topCap = positions.length / 3;
  appendOutlineRing(positions, uvs, outline, topZ, uvScale, center);

  let topWall = -1;
  if (bevelH > 0.001) {
    topWall = positions.length / 3;
    appendOutlineRing(positions, uvs, outline, topWallZ, uvScale, center);
  }

  let bottomWall = -1;
  if (bevelH > 0.001) {
    bottomWall = positions.length / 3;
    appendOutlineRing(positions, uvs, outline, bottomWallZ, uvScale, center, true);
  }

  const bottomCap = positions.length / 3;
  appendOutlineRing(positions, uvs, outline, bottomZ, uvScale, center, true);

  triangulateCap(indices, positions, topCap, samples, ccw, false);
  triangulateCap(indices, positions, bottomCap, samples, ccw, true);

  if (bevelH > 0.001) {
    connectRings(indices, topCap, topWall, samples, false, ccw);
    connectRings(indices, topWall, bottomWall, samples, false, ccw);
    connectRings(indices, bottomWall, bottomCap, samples, false, ccw);
  } else {
    connectRings(indices, topCap, bottomCap, samples, false, ccw);
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
  geometry.userData.slabMesh = true;
  geometry.userData.topologyMeta = {
    boundaryPoints: samples,
    profile: 'slab',
    quadWalls: true,
  };
  geometry.userData.topologyPositions = buildSlabLoopOverlay(
    positions, topCap, bottomCap, topWall, bottomWall, samples, loopDetail,
  );
  return geometry;
}

/** Ear-style cap fill via ShapeUtils — no center pole vertex. */
function triangulateCap(indices, positions, ringStart, samples, ccw, isBack) {
  const contour = [];
  for (let i = 0; i < samples; i++) {
    const idx = (ringStart + i) * 3;
    contour.push(new THREE.Vector2(positions[idx], positions[idx + 1]));
  }

  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  faces.forEach(([a, b, c]) => {
    const va = ringStart + a;
    const vb = ringStart + b;
    const vc = ringStart + c;
    if (isBack) {
      indices.push(ccw ? va : va, ccw ? vc : vb, ccw ? vb : vc);
    } else {
      indices.push(ccw ? va : va, ccw ? vb : vc, ccw ? vc : vb);
    }
  });
}

function appendOutlineRing(positions, uvs, outline, z, uvScale, center, flipY = false) {
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i];
    positions.push(p.x, p.y, z);
    const u = 0.5 + (p.x - center.x) / uvScale;
    const v = 0.5 + (p.y - center.y) / uvScale;
    uvs.push(u, flipY ? 1 - v : v);
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

function buildSlabLoopOverlay(positions, topCap, bottomCap, topWall, bottomWall, samples, detail) {
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

  addRing(topCap);
  addRing(bottomCap);
  if (topWall >= 0) addRing(topWall);
  if (bottomWall >= 0) addRing(bottomWall);

  if (detail === 'full') {
    const step = Math.max(1, Math.floor(samples / 6));
    const wallTop = topWall >= 0 ? topWall : topCap;
    const wallBottom = bottomWall >= 0 ? bottomWall : bottomCap;
    for (let i = 0; i < samples; i += step) {
      addSegment(wallTop + i, wallBottom + i);
    }
  }

  return lines;
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

function averagePoint(points) {
  let x = 0;
  let y = 0;
  points.forEach((p) => {
    x += p.x;
    y += p.y;
  });
  return { x: x / points.length, y: y / points.length };
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
