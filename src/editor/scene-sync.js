import { ctx, getScene } from '../core/context.js';

let observer = null;
let observerPaused = 0;

/** Call before every 3D rebuild so geometry, colors, and stack order match 2D */
export function prepareSceneFor3D() {
  return getScene().prepareFor3D();
}

export function syncObjectOrderFromDom() {
  getScene().syncOrderFromDom();
}

export function syncObjectPropsFromDom() {
  getScene().syncPropsFromDom();
}

export function pauseSceneSync() {
  observerPaused++;
}

export function resumeSceneSync() {
  observerPaused = Math.max(0, observerPaused - 1);
}

const SYNC_ATTRS = new Set([
  'd',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'rx',
  'ry',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'display',
  'fill-rule',
]);

function mutationAffects3D(mutations) {
  return mutations.some((m) => {
    if (observerPaused) return false;
    if (m.type === 'childList') return true;
    if (m.type === 'attributes' && m.attributeName) {
      if (m.attributeName === 'filter' || m.attributeName === 'class') return false;
      return SYNC_ATTRS.has(m.attributeName);
    }
    return false;
  });
}

/** Safety net: any 2D shapes-layer edit triggers a debounced 3D rebuild */
export function initSceneSyncObserver() {
  const { dom } = ctx;
  if (!dom.shapesLayer || observer) return;

  observer = new MutationObserver((mutations) => {
    if (mutationAffects3D(mutations)) {
      getScene().syncOrderFromDom();
      getScene().notifyChanged('dom-sync');
    }
  });

  observer.observe(dom.shapesLayer, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...SYNC_ATTRS, 'filter', 'class'],
  });
}
