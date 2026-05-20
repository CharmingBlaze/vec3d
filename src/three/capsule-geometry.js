import { THREE } from './setup.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Normalize attributes so indexed/non-indexed geometries can merge */
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

/** Flat extrude helper */
function extrudeSlab(shape, depth, curveSegments, bevelOpts = {}) {
  const { bevel = 0, thickness = 0, bevelSegments = 1 } = bevelOpts;
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: thickness,
    bevelSegments: bevel > 0 ? Math.max(bevelSegments, 3) : 1,
    curveSegments,
  });
}

/**
 * Rounded end cap by stacking thin shape slices along a quarter-circle arc.
 * Keeps the full silhouette at every height — no warped triangulation.
 * @param {1 | -1} direction +1 front, -1 back
 */
function createStackedEndCap(shape, baseZ, capHeight, direction, curveSegments) {
  if (capHeight <= 0.01) return null;

  const layers = Math.max(16, Math.ceil(curveSegments * 0.8));
  const parts = [];

  for (let i = 0; i < layers; i++) {
    const t0 = i / layers;
    const t1 = (i + 1) / layers;
    const z0 = baseZ + direction * capHeight * Math.sin((t0 * Math.PI) / 2);
    const z1 = baseZ + direction * capHeight * Math.sin((t1 * Math.PI) / 2);
    const layerDepth = Math.abs(z1 - z0);
    if (layerDepth < 0.001) continue;

    const layer = extrudeSlab(shape, layerDepth, curveSegments);
    layer.translate(0, 0, Math.min(z0, z1));
    parts.push(layer);
  }

  return mergeParts(parts);
}

/**
 * Single watertight capsule mesh: cylindrical body + smoothly rounded end caps.
 * Centered on origin; total height = bodyDepth + 2 * capHeight.
 */
export function createCapsuleGeometry(shape, capHeight, bodyDepth, curveSegments, bevelOpts = {}) {
  const segs = Math.max(curveSegments, 16);
  const parts = [];
  const halfBody = bodyDepth / 2;

  if (bodyDepth > 0.5) {
    const body = extrudeSlab(shape, bodyDepth, segs, bevelOpts);
    body.translate(0, 0, -halfBody);
    parts.push(body);
  }

  const front = createStackedEndCap(shape, halfBody, capHeight, 1, segs);
  const back = createStackedEndCap(shape, -halfBody, capHeight, -1, segs);
  if (front) parts.push(front);
  if (back) parts.push(back);

  return mergeParts(parts);
}
