import { SVG_NS } from '../core/constants.js';
import { ctx } from '../core/context.js';

const MINOR = 20;
const MAJOR = 100;

/** Build / refresh the artboard grid inside canvas-group (pans & zooms with drawing). */
export function updateCanvasGrid() {
  const { dom, state } = ctx;
  if (!dom.mainSvg || !dom.canvasGroup) return;

  let defs = dom.mainSvg.querySelector('#canvas-grid-defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    defs.id = 'canvas-grid-defs';
    dom.mainSvg.insertBefore(defs, dom.mainSvg.firstChild);
  }

  defs.innerHTML = `
    <pattern id="canvas-grid-minor" width="${MINOR}" height="${MINOR}" patternUnits="userSpaceOnUse">
      <path d="M ${MINOR} 0 L 0 0 0 ${MINOR}" fill="none" stroke="rgba(0,0,0,0.045)" stroke-width="1" />
    </pattern>
    <pattern id="canvas-grid-major" width="${MAJOR}" height="${MAJOR}" patternUnits="userSpaceOnUse">
      <rect width="${MAJOR}" height="${MAJOR}" fill="url(#canvas-grid-minor)" />
      <path d="M ${MAJOR} 0 L 0 0 0 ${MAJOR}" fill="none" stroke="rgba(0,0,0,0.11)" stroke-width="1" />
    </pattern>
  `;

  let grid = dom.canvasGrid;
  if (!grid) {
    grid = document.createElementNS(SVG_NS, 'rect');
    grid.id = 'canvas-grid';
    grid.setAttribute('pointer-events', 'none');
    dom.canvasGroup.insertBefore(grid, dom.shapesLayer || dom.canvasBg?.nextSibling);
    dom.canvasGrid = grid;
  }

  grid.setAttribute('x', '0');
  grid.setAttribute('y', '0');
  grid.setAttribute('width', String(state.canvasW));
  grid.setAttribute('height', String(state.canvasH));
  grid.setAttribute('fill', 'url(#canvas-grid-major)');
}

export function initCanvasGrid() {
  updateCanvasGrid();
}
