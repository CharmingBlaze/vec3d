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

/** Hemisphere cap oriented along a unit direction */
function hemisphereCap(origin, outward, radius, radialSeg) {
  const segs = Math.max(6, radialSeg);
  const geo = new THREE.SphereGeometry(
    radius,
    segs,
    Math.max(4, Math.ceil(segs / 2)),
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
 * Rounded tube mesh swept along a drawn centerline (loop rows + round caps).
 * @param {{ x: number, y: number }[]} points
 */
export function createRoundedTubeMesh(points, radius, cx, cy, opts = {}) {
  if (!points || points.length < 2 || radius <= 0) return null;

  const radialSeg = Math.max(8, opts.radialSegments ?? 12);
  const tubularSeg = Math.max(
    16,
    opts.tubularSegments ?? Math.ceil(points.length * 1.5),
  );

  const vecs = toCurvePoints(points, cx, cy);
  if (vecs.length === 2) {
    const mid = vecs[0].clone().lerp(vecs[1], 0.5);
    vecs.splice(1, 0, mid);
  }

  const closed = !!opts.closed;
  if (closed && vecs.length >= 3 && vecs[0].distanceTo(vecs[vecs.length - 1]) < 0.01) {
    vecs.pop();
  }

  const curve = new THREE.CatmullRomCurve3(vecs, closed, 'centripetal', 0.5);
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

  return mergeParts(parts);
}
