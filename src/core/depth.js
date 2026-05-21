/** Resolve slider depth (1–300) to world-space extrusion units. */
export function resolveExtrudeDepth(d3) {
  return Math.max(1, Math.round(d3?.depth ?? 58));
}

/** Depth for new 3D primitive draws — proportional to footprint, clamped to slider range. */
export function depthForPrimitiveDraw(w, h, tool, d3 = {}) {
  const size = Math.max(w, h, 1);
  const slider = resolveExtrudeDepth(d3);
  const proportional = Math.round(size * 0.42);
  let depth = Math.max(slider, proportional);

  if (tool === 'sphere3d') {
    depth = Math.round(Math.max(slider, size * 0.5));
  }

  return Math.max(20, Math.min(300, depth));
}

/** Z offset so extrusion sits on the 2D artboard plane (front cap at z = 0). */
export function extrudeMeshOffsetZ(depth) {
  return -depth / 2;
}
