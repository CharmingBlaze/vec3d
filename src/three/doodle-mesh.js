import { THREE } from './setup.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { editorToThree } from '../svg/geometry.js';

function prepareForMerge(geo) {
  let g = geo;
  if (g.index) {
    g = g.toNonIndexed();
    geo.dispose();
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

function mergeParts(parts) {
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const ready = parts.map(prepareForMerge);
  const merged = mergeGeometries(ready, false);
  ready.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeVertexNormals();
  return merged;
}

/** @param {{ x: number, y: number }[]} points editor space */
function toCurvePoints(points, cx, cy) {
  return points.map((p) => {
    const t = editorToThree(p.x, p.y, cx, cy);
    return new THREE.Vector3(t.x, t.y, 0);
  });
}

function hemisphereCap(origin, outward, radius, radialSeg) {
  const segs = Math.max(8, radialSeg);
  const geo = new THREE.SphereGeometry(
    radius,
    segs,
    Math.max(6, Math.ceil(segs / 2)),
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const up = new THREE.Vector3(0, 1, 0);
  const dir = outward.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  geo.applyQuaternion(q);
  geo.translate(origin.x, origin.y, origin.z);
  return geo;
}

/**
 * Paint 3D–style puffy doodle: CatmullRomCurve3 + TubeGeometry + joint spheres + round caps.
 * @param {{ x: number, y: number }[]} points
 */
export function createDoodleMesh(points, radius, cx, cy, opts = {}) {
  if (!points || points.length < 2 || radius <= 0) return null;

  const radialSeg = Math.max(6, Math.min(10, opts.radialSegments ?? 8));
  const tubularSeg = Math.max(
    12,
    Math.min(36, opts.tubularSegments ?? Math.ceil(points.length * 1.2)),
  );

  let vecs = toCurvePoints(points, cx, cy);
  if (vecs.length === 2) {
    const mid = vecs[0].clone().lerp(vecs[1], 0.5);
    vecs.splice(1, 0, mid);
  }

  const closed = !!opts.closed;
  if (closed && vecs.length >= 3 && vecs[0].distanceTo(vecs[vecs.length - 1]) < 0.01) {
    vecs.pop();
  }

  const curve = new THREE.CatmullRomCurve3(
    vecs,
    closed,
    'centripetal',
    opts.curveTension ?? 0.35,
  );

  const parts = [];
  parts.push(new THREE.TubeGeometry(curve, tubularSeg, radius, radialSeg, closed));

  if (!closed) {
    const start = curve.getPoint(0);
    const end = curve.getPoint(1);
    const tanStart = curve.getTangent(0).normalize();
    const tanEnd = curve.getTangent(1).normalize();
    parts.push(hemisphereCap(start, tanStart.clone().negate(), radius, radialSeg));
    parts.push(hemisphereCap(end, tanEnd, radius, radialSeg));
  }

  const jointR = radius * (opts.jointScale ?? 1.04);
  const sphereSeg = Math.max(6, Math.min(8, radialSeg));
  const jointStep = Math.max(1, Math.ceil(vecs.length / Math.min(8, vecs.length)));
  vecs.forEach((v, i) => {
    if (i % jointStep !== 0 && i !== vecs.length - 1) return;
    const sphere = new THREE.SphereGeometry(
      jointR,
      sphereSeg,
      Math.max(4, Math.ceil(sphereSeg * 0.75)),
    );
    sphere.translate(v.x, v.y, v.z);
    parts.push(sphere);
  });

  const merged = mergeParts(parts);
  if (merged) merged.userData.doodleMesh = true;
  return merged;
}

/**
 * Puffy solid blob from an accurate 2D shape (filled polygons, paths, rects).
 * Uses Three.js ExtrudeGeometry with a soft bevel — follows the drawing exactly.
 */
export function createDoodleSolidGeometry(shape, depth, cseg) {
  const curveSeg = Math.max(4, Math.min(8, cseg));
  const bevelSeg = Math.max(2, Math.min(4, Math.round(cseg / 5)));
  const bevelSize = Math.max(4, depth * 0.32);
  const coreDepth = Math.max(4, depth * 0.2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreDepth,
    bevelEnabled: true,
    bevelSize,
    bevelThickness: bevelSize * 0.88,
    bevelSegments: bevelSeg,
    bevelOffset: 0,
    curveSegments: curveSeg,
    steps: 1,
  });
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb) {
    const cz = (bb.min.z + bb.max.z) / 2;
    if (cz) geo.translate(0, 0, -cz);
  }
  geo.userData.doodleSolid = true;
  return geo;
}

export function mergeDoodleGeometries(parts) {
  return mergeParts(parts.filter(Boolean));
}