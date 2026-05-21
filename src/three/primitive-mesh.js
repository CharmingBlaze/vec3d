import { THREE } from './setup.js';
import { getEditorBBox, editorToThree } from '../svg/geometry.js';
import { resolveExtrudeDepth, extrudeMeshOffsetZ } from '../core/depth.js';

/** Mid-poly segment counts for game-ready primitives. */
export function midPolySegments(cseg = 12) {
  const ring = Math.max(6, Math.min(20, Math.round(cseg * 0.65)));
  return { ring, stack: Math.max(4, Math.min(12, Math.round(cseg * 0.4))) };
}

function footprintFromElement(el, cx, cy) {
  const bb = getEditorBBox(el);
  const tl = editorToThree(bb.x, bb.y, cx, cy);
  const br = editorToThree(bb.x + bb.width, bb.y + bb.height, cx, cy);
  return {
    w: Math.max(1, Math.abs(br.x - tl.x)),
    h: Math.max(1, Math.abs(br.y - tl.y)),
  };
}

/** Build parametric primitive mesh data from object footprint + depth slider. */
export function buildPrimitiveMesh(object, cx, cy, d3) {
  const kind = object.data?.primitive3d;
  if (!kind || !object.el) return null;

  const { w, h } = footprintFromElement(object.el, cx, cy);
  const depth = resolveExtrudeDepth(d3);
  const { ring, stack } = midPolySegments(d3?.cseg ?? 12);

  switch (kind) {
    case 'box':
      return {
        geometry: new THREE.BoxGeometry(w, h, depth),
        depth,
        offsetZ: extrudeMeshOffsetZ(depth),
      };
    case 'sphere': {
      const radius = Math.max(1, Math.min(w, h) / 2);
      return {
        geometry: new THREE.SphereGeometry(radius, ring, stack),
        depth: radius * 2,
        offsetZ: -radius,
      };
    }
    case 'cylinder': {
      const radius = Math.max(1, (w + h) / 4);
      const geo = new THREE.CylinderGeometry(radius, radius, depth, ring, 1);
      geo.rotateX(Math.PI / 2);
      return {
        geometry: geo,
        depth,
        offsetZ: extrudeMeshOffsetZ(depth),
      };
    }
    default:
      return null;
  }
}

export function buildPrimitiveGeometry(object, cx, cy, d3) {
  return buildPrimitiveMesh(object, cx, cy, d3)?.geometry ?? null;
}

export function isPrimitiveObject(object) {
  return !!object?.data?.primitive3d;
}

export { extrudeMeshOffsetZ };
