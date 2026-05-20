import { ctx, getObj } from './context.js';

/** @typedef {{ depth: number, bevel: number, round: number, bseg: number, cseg: number, profile: string, mat: string, shine: number, strokeMode: string }} D3Settings */

export const D3_DEFAULTS = {
  depth: 60,
  bevel: 0,
  round: 0,
  bseg: 1,
  cseg: 6,
  profile: 'game',
  mat: 'flat',
  shine: 100,
  strokeMode: 'flat',
};

/** Document defaults for new layers (no selection). */
export function getDocumentD3() {
  const { state } = ctx;
  if (!state.documentD3) state.documentD3 = { ...D3_DEFAULTS };
  return state.documentD3;
}

export function readD3FromDom(dom = ctx.dom) {
  return {
    depth: +(dom.d3Depth?.value ?? D3_DEFAULTS.depth),
    bevel: +(dom.d3Bevel?.value ?? D3_DEFAULTS.bevel),
    round: +(dom.d3Round?.value ?? D3_DEFAULTS.round),
    bseg: +(dom.d3Bseg?.value ?? D3_DEFAULTS.bseg),
    cseg: +(dom.d3Cseg?.value ?? D3_DEFAULTS.cseg),
    profile: dom.d3Profile?.value ?? D3_DEFAULTS.profile,
    mat: dom.d3Mat?.value ?? D3_DEFAULTS.mat,
    shine: +(dom.d3Shine?.value ?? D3_DEFAULTS.shine),
    strokeMode: dom.d3StrokeMode?.value ?? D3_DEFAULTS.strokeMode,
  };
}

export function applyD3ToDom(d3, dom = ctx.dom) {
  ctx._syncingD3Panel = true;
  if (dom.d3Depth) dom.d3Depth.value = d3.depth;
  if (dom.vvDepth) dom.vvDepth.textContent = String(d3.depth);
  if (dom.d3Bevel) dom.d3Bevel.value = d3.bevel;
  if (dom.vvBevel) dom.vvBevel.textContent = String(d3.bevel);
  if (dom.d3Round) dom.d3Round.value = d3.round;
  if (dom.vvRound) dom.vvRound.textContent = String(d3.round);
  if (dom.d3Bseg) dom.d3Bseg.value = d3.bseg;
  if (dom.vvBseg) dom.vvBseg.textContent = String(d3.bseg);
  if (dom.d3Cseg) dom.d3Cseg.value = d3.cseg;
  if (dom.vvCseg) dom.vvCseg.textContent = String(d3.cseg);
  if (dom.d3Profile) dom.d3Profile.value = d3.profile;
  if (dom.d3Mat) dom.d3Mat.value = d3.mat;
  if (dom.d3Shine) dom.d3Shine.value = d3.shine;
  if (dom.vvShine) dom.vvShine.textContent = String(d3.shine);
  if (dom.d3StrokeMode) dom.d3StrokeMode.value = d3.strokeMode;
  ctx._syncingD3Panel = false;
}

export function syncD3PanelFromDocument() {
  applyD3ToDom(getDocumentD3());
}

export function syncD3PanelFromObject(o) {
  if (!o) {
    syncD3PanelFromDocument();
    return;
  }
  applyD3ToDom(getObjectD3(o));
}

export function ensureObjectD3(o) {
  if (!o.data) o.data = {};
  if (!o.data.d3) o.data.d3 = { ...getDocumentD3() };
  return o.data.d3;
}

/** Resolved 3D settings for mesh generation. */
export function getObjectD3(o) {
  return { ...D3_DEFAULTS, ...getDocumentD3(), ...(o.data?.d3 || {}) };
}

/**
 * Apply partial 3D settings to selection, or document defaults if nothing selected.
 * @returns {boolean} true if any visible layer was updated (rebuild needed)
 */
export function applyD3ToSelection(partial) {
  const { state } = ctx;
  if (!state.selected.length) {
    Object.assign(getDocumentD3(), partial);
    return false;
  }
  state.selected.forEach((id) => {
    const o = getObj(id);
    if (!o) return;
    Object.assign(ensureObjectD3(o), partial);
  });
  return true;
}

/** Profile preset tweaks (same as panel profile dropdown). */
export function profilePresetPatch(profile, current) {
  const d3 = { ...current, profile };
  if (profile === 'game') {
    d3.bseg = 1;
    d3.cseg = Math.min(d3.cseg || 6, 6);
  }
  if (profile === 'capsule') {
    d3.round = 100;
    d3.bseg = Math.max(d3.bseg || 1, 6);
    d3.cseg = Math.max(d3.cseg || 6, 12);
  }
  if (profile === 'tube') {
    d3.strokeMode = 'tube';
    d3.bevel = 0;
    d3.round = 0;
    d3.cseg = Math.max(d3.cseg || 6, 16);
    d3.depth = Math.max(d3.depth || 60, 40);
  }
  return d3;
}

export function initDocumentD3FromDom() {
  Object.assign(getDocumentD3(), readD3FromDom());
}
