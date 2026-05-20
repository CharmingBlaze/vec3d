import { ctx } from '../core/context.js';
import { PALETTE } from '../core/constants.js';
import { updateSelected } from '../editor/objects.js';
import { refreshLayers } from './layers.js';
import { setZoom, fit2DView } from '../svg/coordinates.js';
import { showHandles, showNodeHandles } from '../editor/handles.js';
import { saveHistory } from '../editor/history.js';
import { getObj } from '../core/context.js';
import { deleteSelected } from '../editor/objects.js';
import { finishPen } from '../tools/pen.js';
import { finishPoly } from '../tools/poly.js';
import { getEditorBBox } from '../svg/geometry.js';
import { moveObjects, applyPanelTransform } from '../svg/transform.js';
import { scheduleRealtime3D, flushRealtime3D } from '../three/realtime.js';
import {
  applyD3ToSelection,
  applyD3ToDom,
  readD3FromDom,
  profilePresetPatch,
  getObjectD3,
} from '../core/d3-settings.js';

async function reset3DViewLazy() {
  const { reset3DView } = await import('../three/camera.js');
  reset3DView();
}

async function renderThreeFrameLazy() {
  const { renderThreeFrame } = await import('../three/engine.js');
  renderThreeFrame();
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

export function initControls() {
  const { state, dom } = ctx;

  const palEl = dom.palette;
  PALETTE.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'psw';
    d.style.background = c;
    d.onclick = () => {
      applyColor(c);
      refreshLayers();
    };
    palEl.appendChild(d);
  });

  dom.fillPicker.oninput = (e) => {
    state.fill = e.target.value;
    dom.csFg.style.background = e.target.value;
    if (state.selected.length) updateSelected('fill', e.target.value);
  };
  dom.strokePicker.oninput = (e) => {
    state.stroke = e.target.value;
    dom.csBg.style.background = e.target.value;
    if (state.selected.length) updateSelected('stroke', e.target.value);
  };
  initColorPopup();

  bindSlider('slSw', 'vvSw', 'strokeW', (v) => {
    if (state.selected.length) {
      updateSelected('strokeW', v);
      scheduleRealtime3D();
    }
  });
  bindSlider('slOp', 'vvOp', 'opacity', (v) => {
    if (state.selected.length) updateSelected('opacity', v / 100);
  });
  dom.slSides.oninput = (e) => {
    state.sides = +e.target.value;
    dom.vvSides.textContent = e.target.value;
  };

  init3DPanelControls();

  dom.fillMode.onchange = (e) => {
    state.fillMode = e.target.value;
    const ids = [];
    state.selected.forEach((id) => {
      const o = getObj(id);
      if (!o) return;
      ids.push(id);
      const fill = e.target.value === 'none' ? 'none' : state.fill;
      o.fill = fill;
      o.el.setAttribute('fill', fill);
    });
    if (ids.length) ctx.scene?.notifyStyle(ids);
  };

  dom.zoomInBtn.onclick = () => setZoom(state.zoom * 1.25);
  dom.zoomOutBtn.onclick = () => setZoom(state.zoom * 0.8);
  dom.zoomFit.onclick = () => {
    if (ctx.state.activeScreen === '3d') {
      reset3DViewLazy();
      return;
    }
    fit2DView();
  };
  if (dom.zoomFit3d) dom.zoomFit3d.onclick = () => reset3DViewLazy();

  const applyLivePanel = () => {
    state.selected.forEach((id) => {
      const o = getObj(id);
      if (!o) return;
      applyPanelTransform(o, {
        x: +dom.propX.value,
        y: +dom.propY.value,
        w: +dom.propW.value,
        h: +dom.propH.value,
        rot: +dom.propR.value,
        scale: +dom.propS.value,
      });
    });
    showHandles();
  };

  ['propX', 'propY', 'propW', 'propH', 'propR', 'propS'].forEach((key) => {
    const el = dom[key];
    if (el) el.addEventListener('input', applyLivePanel);
  });

  dom.propApply.onclick = () => {
    saveHistory();
    flushRealtime3D();
  };

  initAlignButtons();

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
      ctx.state.fill = 'none';
      ctx.dom.csFg.style.background = 'transparent';
      updateSelected('fill', 'none');
    } else {
      ctx.state.stroke = 'none';
      ctx.dom.csBg.style.background = 'transparent';
      updateSelected('stroke', 'none');
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
  const { state, dom } = ctx;
  dom.colorHex.value = hex;
  if (colorTarget === 'fill') {
    state.fill = hex;
    dom.fillPicker.value = hex;
    dom.csFg.style.background = hex;
    updateSelected('fill', hex);
  } else {
    state.stroke = hex;
    dom.strokePicker.value = hex;
    dom.csBg.style.background = hex;
    updateSelected('stroke', hex);
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
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.remove('on'));
      document.querySelectorAll('[data-sh]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      dom.sbTool.textContent = `Tool: shape (${state.shape})`;
    };
  });
}

/** Wire every control in the 3D Live panel */
function init3DPanelControls() {
  const { dom, state } = ctx;

  const commitD3 = (partial, opts = {}) => {
    if (ctx._syncingD3Panel) return;
    const needsRebuild = applyD3ToSelection(partial);
    if (opts.syncPanel && state.selected.length === 1) {
      applyD3ToDom(getObjectD3(getObj(state.selected[0])));
    }
    if (needsRebuild) scheduleRealtime3D();
  };

  const commitD3FromDom = () => commitD3(readD3FromDom(dom));

  const rebuildOrRefreshSelected = async () => {
    if (!state.selected.length) return;
    if (!(await refresh3DAppearanceLazy())) scheduleRealtime3D();
  };

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
    if (partial.round > 0 && +dom.d3Cseg.value < 12) {
      partial.cseg = 12;
      dom.d3Cseg.value = 12;
      dom.vvCseg.textContent = '12';
    }
    commitD3(partial);
  });
  bindD3Slider('d3Bseg', () => commitD3({ bseg: +dom.d3Bseg.value }));
  bindD3Slider('d3Cseg', () => commitD3({ cseg: +dom.d3Cseg.value }));

  if (dom.d3StrokeMode) {
    dom.d3StrokeMode.onchange = () => {
      const strokeMode = dom.d3StrokeMode.value;
      if (state.selected.length) {
        commitD3({ strokeMode });
        if (strokeMode === 'tube') state.strokeMeshMode = 'tube';
      } else {
        state.strokeMeshMode = strokeMode;
        applyD3ToSelection({ strokeMode });
      }
    };
  }

  bindD3Slider('d3Shine', () => {
    commitD3({ shine: +dom.d3Shine.value });
    rebuildOrRefreshSelected();
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
      if (mat !== 'flat' && (state.viewMode3d === 'solid' || state.viewMode3d === 'solid-lines')) {
        setViewMode3dLazy('textured');
      }
      commitD3({ mat });
      rebuildOrRefreshSelected();
    };
  }

  if (dom.d3Profile) {
    dom.d3Profile.onchange = () => {
      const base = state.selected.length && getObj(state.selected[0])
        ? getObjectD3(getObj(state.selected[0]))
        : readD3FromDom(dom);
      const patched = profilePresetPatch(dom.d3Profile.value, base);
      applyD3ToDom(patched);
      if (patched.profile === 'tube') state.strokeMeshMode = 'tube';
      const needsRebuild = applyD3ToSelection(patched);
      if (needsRebuild) flushRealtime3D();
      else if (state.selected.length) saveHistory();
    };
  }

  if (dom.btn3dReset) dom.btn3dReset.onclick = () => reset3DRotationLazy();
}

function initAlignButtons() {
  const { state, dom } = ctx;
  const alignMap = {
    alL: 'left',
    alR: 'right',
    alT: 'top',
    alB: 'bottom',
    alCx: 'centerX',
    alCy: 'centerY',
  };
  Object.entries(alignMap).forEach(([key, mode]) => {
    const btn = dom[key];
    if (!btn) return;
    btn.onclick = () => {
      const items = state.selected.map((id) => getObj(id)).filter(Boolean);
      if (items.length < 2) return;
      const boxes = items.map((o) => ({ o, bb: getEditorBBox(o.el) }));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      boxes.forEach(({ bb }) => {
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      });
      boxes.forEach(({ o, bb }) => {
        let dx = 0;
        let dy = 0;
        if (mode === 'left') dx = minX - bb.x;
        if (mode === 'right') dx = maxX - (bb.x + bb.width);
        if (mode === 'top') dy = minY - bb.y;
        if (mode === 'bottom') dy = maxY - (bb.y + bb.height);
        if (mode === 'centerX') dx = (minX + maxX) / 2 - (bb.x + bb.width / 2);
        if (mode === 'centerY') dy = (minY + maxY) / 2 - (bb.y + bb.height / 2);
        if (dx || dy) moveObjects([o.id], dx, dy);
      });
      showHandles();
      saveHistory();
      flushRealtime3D();
    };
  });
}
