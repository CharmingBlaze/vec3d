import { ctx } from '../core/context.js';
import { PALETTE } from '../core/constants.js';
import { refreshLayers } from './layers.js';
import { setZoom, fit2DView } from '../svg/coordinates.js';
import { showHandles, showNodeHandles } from '../editor/handles.js';
import { saveHistory } from '../editor/history.js';
import { getObj } from '../core/context.js';
import { deleteSelected } from '../editor/objects.js';
import { finishPen } from '../tools/pen.js';
import { finishPoly } from '../tools/poly.js';
import { scheduleRealtime3D, flushRealtime3D } from '../three/realtime.js';
import {
  applyD3ToSelection,
  applyD3ToDom,
  readD3FromDom,
  profilePresetPatch,
  getObjectD3,
} from '../core/d3-settings.js';
import {
  applyStyleChange,
  isEditingSelection,
} from '../core/object-settings.js';
import { topoPresetD3Patch } from '../topology/topology-settings.js';

async function reset3DViewLazy() {
  const { reset3DView } = await import('../three/camera.js');
  reset3DView();
}

async function renderThreeFrameLazy() {
  const { renderThreeFrame } = await import('../three/engine.js');
  renderThreeFrame();
}

async function setThreeBackgroundLazy(color) {
  const { setThreeBackground } = await import('../three/engine.js');
  setThreeBackground(color);
}

async function updateSceneLightsLazy() {
  const { updateSceneLights } = await import('../three/materials.js');
  updateSceneLights();
}

async function refresh3DAppearanceLazy() {
  const { refresh3DAppearance } = await import('../three/viewMode.js');
  return refresh3DAppearance();
}

async function setViewMode3dLazy(mode) {
  const { setViewMode3d } = await import('../three/viewMode.js');
  setViewMode3d(mode);
}

async function reset3DRotationLazy() {
  const { reset3DRotation } = await import('../three/view.js');
  reset3DRotation();
}

async function setGizmoModeLazy(mode) {
  const { setGizmoMode } = await import('../three/gizmos.js');
  setGizmoMode(mode);
}

function syncColorSwatchSelection(hex, target = colorTarget) {
  const norm = (hex || '').toLowerCase();
  document.querySelectorAll('.psw, .canvas-csw').forEach((el) => {
    const match = (el.style.background || '').toLowerCase() === norm
      || (el.dataset.color || '').toLowerCase() === norm;
    el.classList.toggle('on', match && target === 'fill');
  });
}

function mountPaletteSwatches(container, className, onPick) {
  if (!container) return;
  container.innerHTML = '';
  PALETTE.forEach((c) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = className;
    d.style.background = c;
    d.dataset.color = c;
    d.title = c;
    d.onclick = () => onPick(c);
    container.appendChild(d);
  });
}

export function initControls() {
  const { state, dom } = ctx;

  mountPaletteSwatches(dom.palette, 'psw', (c) => {
    colorTarget = 'fill';
    applyColor(c);
    refreshLayers();
  });

  mountPaletteSwatches(dom.canvasColorStrip, 'canvas-csw', (c) => {
    colorTarget = 'fill';
    applyColor(c);
    refreshLayers();
  });

  syncColorSwatchSelection(state.fill, 'fill');

  dom.fillPicker.oninput = (e) => {
    const val = e.target.value;
    dom.csFg.style.background = val;
    const { scope, changed } = applyStyleChange({ fill: val, fillMode: 'solid' });
    if (scope === 'selection' && changed) scheduleRealtime3D();
  };
  dom.strokePicker.oninput = (e) => {
    const val = e.target.value;
    dom.csBg.style.background = val;
    const { changed } = applyStyleChange({ stroke: val });
    if (changed) scheduleRealtime3D();
  };
  initColorPopup();
  initCanvasControls();

  bindSlider('slSw', 'vvSw', 'strokeW', (v) => {
    const { changed } = applyStyleChange({ strokeW: v });
    if (changed) scheduleRealtime3D();
  });
  bindSlider('slOp', 'vvOp', 'opacity', (v) => {
    applyStyleChange({ opacity: v });
  });
  dom.slSides.oninput = (e) => {
    state.sides = +e.target.value;
    dom.vvSides.textContent = e.target.value;
  };

  init3DPanelControls();

  dom.fillMode.onchange = (e) => {
    const fillMode = e.target.value;
    const fill = fillMode === 'none' ? 'none' : ctx.state.fill;
    const { changed } = applyStyleChange({ fillMode, fill });
    if (changed) scheduleRealtime3D();
  };
  if (dom.freehandAutoClose) {
    dom.freehandAutoClose.checked = state.freehandAutoClose;
    dom.freehandAutoClose.onchange = (e) => {
      state.freehandAutoClose = e.target.checked;
    };
  }

  dom.zoomInBtn.onclick = () => setZoom(state.zoom * 1.25);
  dom.zoomOutBtn.onclick = () => setZoom(state.zoom * 0.8);
  dom.zoomFit.onclick = () => fit2DView();
  if (dom.zoomFit3d) dom.zoomFit3d.onclick = () => reset3DViewLazy();
  init3DGizmoControls();

  dom.lnDel.onclick = () => deleteSelected();
  dom.lnUp.onclick = () => {
    ctx.scene.moveUp(ctx.state.selected);
    saveHistory();
  };
  dom.lnDn.onclick = () => {
    ctx.scene.moveDown(ctx.state.selected);
    saveHistory();
  };

}

function init3DGizmoControls() {
  const { dom, state } = ctx;
  const buttons = [
    ['translate', dom.gizmoTranslate],
    ['rotate', dom.gizmoRotate],
    ['scale', dom.gizmoScale],
  ];
  const sync = () => {
    buttons.forEach(([mode, btn]) => btn?.classList.toggle('on', state.gizmoMode === mode));
  };

  buttons.forEach(([mode, btn]) => {
    if (!btn) return;
    btn.onclick = () => {
      state.gizmoMode = mode;
      sync();
      setGizmoModeLazy(mode);
    };
  });
  sync();
}

function syncViewBgDot(picker, dot) {
  if (picker && dot) dot.style.background = picker.value;
}

function initCanvasControls() {
  const { state, dom } = ctx;
  if (dom.bg2dPicker) {
    dom.bg2dPicker.value = state.bg2d;
    if (dom.canvasBg) dom.canvasBg.setAttribute('fill', state.bg2d);
    syncViewBgDot(dom.bg2dPicker, dom.bg2dDot);
    dom.bg2dPicker.oninput = (e) => {
      state.bg2d = e.target.value;
      if (dom.canvasBg) dom.canvasBg.setAttribute('fill', state.bg2d);
      syncViewBgDot(dom.bg2dPicker, dom.bg2dDot);
    };
  }
  if (dom.bg3dPicker) {
    dom.bg3dPicker.value = state.bg3d;
    syncViewBgDot(dom.bg3dPicker, dom.bg3dDot);
    dom.bg3dPicker.oninput = (e) => {
      syncViewBgDot(dom.bg3dPicker, dom.bg3dDot);
      setThreeBackgroundLazy(e.target.value);
    };
  }
}

function initPanelTabs() {
  document.querySelectorAll('.panel-tabs').forEach((tabs) => {
    const panel = tabs.parentElement;
    tabs.querySelectorAll('[data-panel-target]').forEach((btn) => {
      btn.onclick = () => {
        const target = btn.dataset.panelTarget;
        tabs.querySelectorAll('.panel-tab').forEach((b) => b.classList.toggle('on', b === btn));
        panel.querySelectorAll(':scope > .panel-page').forEach((page) => {
          page.classList.toggle('on', page.dataset.panel === target);
        });
      };
    });
  });
}

let colorTarget = 'fill';
let colorHue = 186;
let colorSv = { s: 1, v: 1 };

function initColorPopup() {
  const { dom } = ctx;
  drawColorRect();

  dom.csFg.onclick = (e) => {
    e.stopPropagation();
    openColorPopover('fill');
  };
  dom.csBg.onclick = (e) => {
    e.stopPropagation();
    openColorPopover('stroke');
  };
  dom.colorOpen.onclick = (e) => {
    e.stopPropagation();
    openColorPopover(colorTarget);
  };
  dom.colorPopover.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', () => {
    if (dom.colorPopover) dom.colorPopover.hidden = true;
  });

  document.querySelectorAll('[data-color-target]').forEach((btn) => {
    btn.onclick = () => {
      colorTarget = btn.dataset.colorTarget;
      document.querySelectorAll('[data-color-target]').forEach((b) => b.classList.toggle('on', b === btn));
      const hex = colorTarget === 'fill' ? ctx.state.fill : ctx.state.stroke;
      if (hex !== 'none') syncColorFromHex(hex);
    };
  });

  dom.colorHue.oninput = () => {
    colorHue = +dom.colorHue.value;
    drawColorRect();
    applyColor(hsvToHex(colorHue, colorSv.s, colorSv.v));
  };

  dom.colorRect.addEventListener('pointerdown', pickFromRect);
  dom.colorRect.addEventListener('pointermove', (e) => {
    if (e.buttons === 1) pickFromRect(e);
  });

  dom.colorHex.onchange = () => {
    const val = normalizeHex(dom.colorHex.value);
    if (!val) return;
    syncColorFromHex(val);
    applyColor(val);
  };

  dom.colorNone.onclick = () => {
    if (colorTarget === 'fill') {
      dom.csFg.style.background = 'transparent';
      const { changed } = applyStyleChange({ fill: 'none', fillMode: 'none' });
      if (changed) scheduleRealtime3D();
    } else {
      dom.csBg.style.background = 'transparent';
      applyStyleChange({ stroke: 'none' });
    }
    refreshLayers();
  };
}

function openColorPopover(target) {
  colorTarget = target;
  ctx.dom.colorPopover.hidden = false;
  document.querySelectorAll('[data-color-target]').forEach((b) => {
    b.classList.toggle('on', b.dataset.colorTarget === target);
  });
  const hex = target === 'fill' ? ctx.state.fill : ctx.state.stroke;
  if (hex !== 'none') syncColorFromHex(hex);
}

function pickFromRect(e) {
  const rect = ctx.dom.colorRect.getBoundingClientRect();
  colorSv = {
    s: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    v: 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
  applyColor(hsvToHex(colorHue, colorSv.s, colorSv.v));
}

function applyColor(hex) {
  const { dom } = ctx;
  dom.colorHex.value = hex;
  if (colorTarget === 'fill') {
    dom.fillPicker.value = hex;
    dom.csFg.style.background = hex;
    const { changed } = applyStyleChange({ fill: hex, fillMode: 'solid' });
    syncColorSwatchSelection(hex, 'fill');
    if (changed) scheduleRealtime3D();
  } else {
    dom.strokePicker.value = hex;
    dom.csBg.style.background = hex;
    const { changed } = applyStyleChange({ stroke: hex });
    if (changed) scheduleRealtime3D();
  }
}

function drawColorRect() {
  const canvas = ctx.dom.colorRect;
  if (!canvas) return;
  const c = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = `hsl(${colorHue}, 100%, 50%)`;
  c.fillRect(0, 0, w, h);
  const white = c.createLinearGradient(0, 0, w, 0);
  white.addColorStop(0, '#fff');
  white.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = white;
  c.fillRect(0, 0, w, h);
  const black = c.createLinearGradient(0, 0, 0, h);
  black.addColorStop(0, 'rgba(0,0,0,0)');
  black.addColorStop(1, '#000');
  c.fillStyle = black;
  c.fillRect(0, 0, w, h);
}

function syncColorFromHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  colorHue = Math.round(hsv.h);
  colorSv = { s: hsv.s, v: hsv.v };
  ctx.dom.colorHue.value = colorHue;
  ctx.dom.colorHex.value = hex;
  drawColorRect();
}

function normalizeHex(val) {
  const v = val.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`;
  return null;
}

function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex) {
  const val = normalizeHex(hex);
  if (!val) return null;
  const n = parseInt(val.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d && max === r) h = 60 * (((g - b) / d) % 6);
  else if (d && max === g) h = 60 * ((b - r) / d + 2);
  else if (d) h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h, s: max ? d / max : 0, v: max };
}

function bindSlider(sliderKey, valueKey, stateKey, onChange) {
  const el = ctx.dom[sliderKey];
  const v = ctx.dom[valueKey];
  el.oninput = () => {
    ctx.state[stateKey] = +el.value;
    v.textContent = el.value;
    if (onChange) onChange(+el.value);
  };
}

export function initToolbar() {
  const { state, dom } = ctx;

  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.tool === 'zoom-in') {
        setZoom(state.zoom * 1.25);
        return;
      }
      if (b.dataset.tool === 'zoom-out') {
        setZoom(state.zoom * 0.8);
        return;
      }
      state.tool = b.dataset.tool;
      if (state.penPoints.length) finishPen(true);
      if (state.polyPoints.length) finishPoly(true);
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.remove('on'));
      document.querySelectorAll('[data-sh]').forEach((x) => x.classList.remove('on'));
      dom.shapePopupBtn?.classList.remove('on');
      b.classList.add('on');
      dom.sbTool.textContent = `Tool: ${state.tool}`;
      if (state.tool === 'node' && state.selected.length) showNodeHandles();
      else if (state.tool !== 'node') showHandles();
    };
  });

  document.querySelectorAll('[data-sh]').forEach((b) => {
    b.onclick = () => {
      state.shape = b.dataset.sh;
      state.tool = 'shape';
      if (dom.shapePopover) dom.shapePopover.hidden = true;
      if (dom.shapePopupBtn) dom.shapePopupBtn.classList.remove('on');
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.remove('on'));
      document.querySelectorAll('[data-sh]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      dom.sbTool.textContent = `Tool: shape (${state.shape})`;
    };
  });

  if (dom.shapePopupBtn && dom.shapePopover) {
    dom.shapePopupBtn.onclick = (e) => {
      e.stopPropagation();
      const nextHidden = !dom.shapePopover.hidden ? true : false;
      dom.shapePopover.hidden = nextHidden;
      dom.shapePopupBtn.classList.toggle('on', !nextHidden);
    };
    dom.shapePopover.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('pointerdown', () => {
      dom.shapePopover.hidden = true;
      dom.shapePopupBtn.classList.remove('on');
    });
  }
}

/** Wire every control in the 3D Live panel */
function init3DPanelControls() {
  const { dom, state } = ctx;

  const GEOMETRY_KEYS = new Set([
    'depth', 'bevel', 'round', 'bseg', 'cseg', 'inflation',
    'topoPreset', 'profile', 'strokeMode',
  ]);

  const refreshAll3D = async () => {
    if (!(await refresh3DAppearanceLazy())) scheduleRealtime3D();
  };

  const commitD3 = (partial, opts = {}) => {
    if (ctx._syncingD3Panel) return;
    const updated = applyD3ToSelection(partial);
    if (opts.syncPanel && state.selected.length === 1) {
      applyD3ToDom(getObjectD3(getObj(state.selected[0])));
    }
    const affectsGeometry = opts.appearanceOnly
      ? false
      : Object.keys(partial).some((k) => GEOMETRY_KEYS.has(k));
    if (updated && affectsGeometry) scheduleRealtime3D();
    else if (updated && opts.appearanceOnly) refreshAll3D();
  };

  const commitD3FromDom = () => commitD3(readD3FromDom(dom));

  const bindD3Slider = (id, onChange) => {
    const el = dom[id];
    const vid = dom[`vv${id.slice(3)}`];
    if (!el) return;
    el.oninput = () => {
      if (vid) vid.textContent = el.value;
      onChange();
    };
    el.onchange = () => {
      if (state.selected.length) saveHistory();
    };
  };

  bindD3Slider('d3Depth', () => commitD3({ depth: +dom.d3Depth.value }));
  bindD3Slider('d3Bevel', () => {
    const partial = { bevel: +dom.d3Bevel.value };
    if (partial.bevel > 0 && +dom.d3Bseg.value < 3) {
      partial.bseg = 3;
      dom.d3Bseg.value = 3;
      dom.vvBseg.textContent = '3';
    }
    commitD3(partial);
  });
  bindD3Slider('d3Round', () => {
    const partial = { round: +dom.d3Round.value };
    if (partial.round > 0 && +dom.d3Cseg.value < 24) {
      partial.cseg = 24;
      dom.d3Cseg.value = 24;
      dom.vvCseg.textContent = '24';
    }
    commitD3(partial);
  });
  bindD3Slider('d3Bseg', () => commitD3({ bseg: +dom.d3Bseg.value }));
  bindD3Slider('d3Cseg', () => commitD3({ cseg: +dom.d3Cseg.value }));
  bindD3Slider('d3Inflation', () => commitD3({ inflation: +dom.d3Inflation.value }));

  if (dom.d3TopoPreset) {
    dom.d3TopoPreset.onchange = () => {
      const base = state.selected.length && getObj(state.selected[0])
        ? getObjectD3(getObj(state.selected[0]))
        : readD3FromDom(dom);
      const patched = topoPresetD3Patch(dom.d3TopoPreset.value, base);
      applyD3ToDom(patched);
      const needsRebuild = applyD3ToSelection(patched);
      if (needsRebuild) scheduleRealtime3D();
    };
  }

  if (dom.d3StrokeMode) {
    dom.d3StrokeMode.onchange = () => {
      const strokeMode = dom.d3StrokeMode.value;
      const updated = applyD3ToSelection({ strokeMode });
      if (!isEditingSelection()) ctx.state.strokeMeshMode = strokeMode;
      if (updated) scheduleRealtime3D();
    };
  }

  bindD3Slider('d3Shine', () => {
    commitD3({ shine: +dom.d3Shine.value }, { appearanceOnly: true });
  });

  if (dom.d3Light) {
    dom.d3Light.oninput = () => {
      dom.vvLight.textContent = dom.d3Light.value;
      updateSceneLightsLazy();
      renderThreeFrameLazy();
    };
  }

  if (dom.d3Mat) {
    dom.d3Mat.onchange = () => {
      const mat = dom.d3Mat.value;
      if (mat === 'wireframe') {
        setViewMode3dLazy('wireframe');
        return;
      }
      if (mat !== 'flat' && (state.viewMode3d === 'solid' || state.viewMode3d === 'solid-loops')) {
        setViewMode3dLazy('textured');
      }
      commitD3({ mat }, { appearanceOnly: true });
    };
  }

  if (dom.d3Profile) {
    dom.d3Profile.onchange = () => {
      const base = state.selected.length && getObj(state.selected[0])
        ? getObjectD3(getObj(state.selected[0]))
        : readD3FromDom(dom);
      const patched = profilePresetPatch(dom.d3Profile.value, base);
      applyD3ToDom(patched);
      if (!isEditingSelection()) {
        ctx.state.strokeMeshMode = patched.strokeMode ?? ctx.state.strokeMeshMode;
      }
      const needsRebuild = applyD3ToSelection(patched);
      if (needsRebuild) flushRealtime3D();
      else if (state.selected.length) saveHistory();
    };
  }

  if (dom.btn3dReset) dom.btn3dReset.onclick = () => reset3DRotationLazy();
}
