import { ctx, getObj } from './context.js';
import {
  applyD3ToDom,
  getDocumentD3,
  getObjectD3,
  syncD3PanelFromDocument,
  syncD3PanelFromObject,
} from './d3-settings.js';

/** @typedef {{ fill: string, stroke: string, strokeW: number, opacity: number, fillMode: string }} LayerStyle */

export const STYLE_DEFAULTS = {
  fill: '#ff6b35',
  stroke: '#ffffff',
  strokeW: 2,
  opacity: 100,
  fillMode: 'solid',
};

/** Defaults used when creating the next new shape (no selection). */
export function getDocumentStyle() {
  const { state } = ctx;
  if (!state.documentStyle) {
    state.documentStyle = {
      fill: state.fill ?? STYLE_DEFAULTS.fill,
      stroke: state.stroke ?? STYLE_DEFAULTS.stroke,
      strokeW: state.strokeW ?? STYLE_DEFAULTS.strokeW,
      opacity: state.opacity ?? STYLE_DEFAULTS.opacity,
      fillMode: state.fillMode ?? STYLE_DEFAULTS.fillMode,
    };
  }
  return state.documentStyle;
}

/** Style snapshot for one layer. */
export function getObjectStyle(o) {
  if (!o) return { ...getDocumentStyle() };
  return {
    fill: o.fill,
    stroke: o.stroke,
    strokeW: o.sw,
    opacity: Math.round((o.op ?? 1) * 100),
    fillMode: o.data?.fillMode ?? (o.fill === 'none' ? 'none' : 'solid'),
  };
}

export function isEditingSelection() {
  return ctx.state.selected.length > 0;
}

export function getSelectedObjects() {
  return ctx.state.selected.map((id) => getObj(id)).filter(Boolean);
}

/** Keep draw-preview state aligned with document defaults. */
export function syncDrawStateFromDocumentStyle() {
  const doc = getDocumentStyle();
  const { state } = ctx;
  state.fill = doc.fill;
  state.stroke = doc.stroke;
  state.strokeW = doc.strokeW;
  state.opacity = doc.opacity;
  state.fillMode = doc.fillMode;
  state.strokeMeshMode = getDocumentD3().strokeMode ?? 'flat';
}

export function syncDrawStateFromObject(o) {
  const style = getObjectStyle(o);
  const { state } = ctx;
  state.fill = style.fill === 'none' ? getDocumentStyle().fill : style.fill;
  state.stroke = style.stroke;
  state.strokeW = style.strokeW;
  state.opacity = style.opacity;
  state.fillMode = style.fillMode;
  state.strokeMeshMode = getObjectD3(o).strokeMode ?? 'flat';
}

function applyStyleToObject(o, partial) {
  if (!o?.el) return;
  if (!o.data) o.data = {};

  if (partial.fillMode !== undefined) {
    o.data.fillMode = partial.fillMode;
    if (partial.fillMode === 'none') {
      o.fill = 'none';
      o.el.setAttribute('fill', 'none');
    } else if (o.fill === 'none') {
      const fill = partial.fill ?? getDocumentStyle().fill;
      o.fill = fill;
      o.el.setAttribute('fill', fill);
    }
  }

  if (partial.fill !== undefined && partial.fillMode !== 'none') {
    o.fill = partial.fill;
    o.el.setAttribute('fill', partial.fill);
    if (partial.fill !== 'none') o.data.fillMode = o.data.fillMode ?? 'solid';
  }

  if (partial.stroke !== undefined) {
    o.stroke = partial.stroke;
    o.el.setAttribute('stroke', partial.stroke);
  }

  if (partial.strokeW !== undefined) {
    o.sw = partial.strokeW;
    o.el.setAttribute('stroke-width', partial.strokeW);
  }

  if (partial.opacity !== undefined) {
    o.op = partial.opacity / 100;
    o.el.setAttribute('opacity', o.op);
  }
}

/**
 * Update selected layer(s), or document defaults for the next new shape.
 * @returns {{ scope: 'selection' | 'document', changed: boolean }}
 */
export function applyStyleChange(partial) {
  const selected = getSelectedObjects();
  if (selected.length) {
    selected.forEach((o) => applyStyleToObject(o, partial));
    ctx.scene?.notifyStyle(selected.map((o) => o.id));
    return { scope: 'selection', changed: true };
  }

  const doc = getDocumentStyle();
  Object.assign(doc, partial);
  syncDrawStateFromDocumentStyle();
  return { scope: 'document', changed: false };
}

export function applyStyleToDom(style, dom = ctx.dom) {
  if (dom.fillPicker && style.fill !== 'none') dom.fillPicker.value = style.fill;
  if (dom.strokePicker && style.stroke !== 'none') dom.strokePicker.value = style.stroke;
  if (dom.csFg) dom.csFg.style.background = style.fill === 'none' ? 'transparent' : style.fill;
  if (dom.csBg) dom.csBg.style.background = style.stroke === 'none' ? 'transparent' : style.stroke;
  if (dom.slSw) dom.slSw.value = style.strokeW;
  if (dom.vvSw) dom.vvSw.textContent = String(style.strokeW);
  if (dom.slOp) dom.slOp.value = style.opacity;
  if (dom.vvOp) dom.vvOp.textContent = String(style.opacity);
  if (dom.fillMode) dom.fillMode.value = style.fillMode;
  syncPaletteSelection(style.fill);
}

function syncPaletteSelection(fill) {
  if (fill === 'none') {
    document.querySelectorAll('.psw, .canvas-csw').forEach((el) => el.classList.remove('on'));
    return;
  }
  const norm = fill.toLowerCase();
  document.querySelectorAll('.psw, .canvas-csw').forEach((el) => {
    const c = (el.dataset.color || el.style.background || '').toLowerCase();
    el.classList.toggle('on', c === norm);
  });
}

export function syncStylePanelFromDocument() {
  applyStyleToDom(getDocumentStyle());
  syncDrawStateFromDocumentStyle();
}

export function syncStylePanelFromObject(o) {
  if (!o) {
    syncStylePanelFromDocument();
    return;
  }
  applyStyleToDom(getObjectStyle(o));
  syncDrawStateFromObject(o);
}

/** Sync fill/stroke sliders and 3D panel from selection or new-layer defaults. */
export function syncPanelFromContext() {
  const { state } = ctx;
  if (!state.selected.length) {
    syncStylePanelFromDocument();
    syncD3PanelFromDocument();
    setPanelScopeHint('document');
    return;
  }

  const o = getObj(state.selected[0]);
  syncStylePanelFromObject(o);
  syncD3PanelFromObject(o);
  setPanelScopeHint('selection', state.selected.length);
}

function setPanelScopeHint(scope, count = 0) {
  const { dom } = ctx;
  const label = scope === 'selection'
    ? (count > 1 ? `Editing ${count} layers` : 'Editing layer')
    : 'New layer defaults';
  if (dom.sbTool && dom.sbTool.dataset.settingsScope !== 'sticky') {
    dom._settingsScopeLabel = label;
  }
}

export function initDocumentStyleFromState() {
  Object.assign(getDocumentStyle(), {
    fill: ctx.state.fill ?? STYLE_DEFAULTS.fill,
    stroke: ctx.state.stroke ?? STYLE_DEFAULTS.stroke,
    strokeW: ctx.state.strokeW ?? STYLE_DEFAULTS.strokeW,
    opacity: ctx.state.opacity ?? STYLE_DEFAULTS.opacity,
    fillMode: ctx.state.fillMode ?? STYLE_DEFAULTS.fillMode,
  });
}

/** Style values copied onto a newly created object. */
export function styleForNewObject() {
  const doc = getDocumentStyle();
  return {
    fill: doc.fillMode === 'none' ? 'none' : doc.fill,
    stroke: doc.stroke,
    strokeW: doc.strokeW,
    opacity: doc.opacity,
    fillMode: doc.fillMode,
  };
}
