import { ctx } from './context.js';

/** Depth + stroke width → visible 3D tube radius */
export function tubeRadiusFromDepth(strokeW, depth, profile) {
  const strokeR = Math.max(1, strokeW / 2);
  const depthR = Math.max(4, depth / 5);
  if (profile === 'tube') return Math.max(strokeR, depthR);
  return Math.max(strokeR, depth / 8);
}

export function shouldDrawAsTube() {
  const { state } = ctx;
  return (
    state.tool === 'tube' ||
    state.strokeMeshMode === 'tube'
  );
}

/** True when this object should rebuild as a swept tube mesh in 3D. */
export function shouldUseTubeMesh(o, style, profile) {
  if (o.type === 'tube') return true;
  const tag = o.el?.tagName?.toLowerCase();
  if (!['path', 'line', 'polyline'].includes(tag)) return false;

  const layerStrokeMode = o.data?.d3?.strokeMode;
  if (layerStrokeMode === 'flat') return false;

  if (profile === 'tube' || layerStrokeMode === 'tube') return true;

  const fill = style.fill;
  const strokeOnly = !fill || fill === 'none' || fill === 'transparent';
  if (strokeOnly && style.sw > 0) return true;

  if (tag === 'path' && style.sw > 0) {
    const d = (o.el.getAttribute('d') || '').trim();
    if (/[zZ]\s*$/.test(d)) return true;
    if (o.data?.pts?.length >= 3) return true;
    if (o.data?.closed) return true;
  }

  return false;
}
