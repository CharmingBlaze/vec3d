import { SVG_NS } from '../core/constants.js';
import { ctx } from '../core/context.js';

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

export function applyStyle(el, fill, stroke, sw, op = 1) {
  const { state } = ctx;
  el.setAttribute('fill', fill === 'none' || state.fillMode === 'none' ? 'none' : fill);
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', sw);
  el.setAttribute('opacity', op);
}

export function ensureSelectionGlow() {
  if (document.getElementById('sel-glow')) return;
  const defs = svgEl('defs');
  const f = svgEl('filter', { id: 'sel-glow' });
  const fe = svgEl('feDropShadow', {
    dx: '0',
    dy: '0',
    stdDeviation: '3',
    'flood-color': '#00e5ff',
    'flood-opacity': '0.8',
  });
  f.appendChild(fe);
  defs.appendChild(f);
  ctx.dom.mainSvg.insertBefore(defs, ctx.dom.mainSvg.firstChild);
}
