import { ctx } from '../core/context.js';
import { TOOL_SHORTCUTS } from '../core/constants.js';
import { undo, redo } from '../editor/history.js';
import { deselectAll } from '../editor/selection.js';
import { deleteSelected } from '../editor/objects.js';
import { setZoom } from '../svg/coordinates.js';
import { finishPen } from '../tools/pen.js';
import { finishPoly, clearPolyPreview } from '../tools/poly.js';
import { exportSVG } from '../io/svg-io.js';
import { selectObj, updateProps } from '../editor/selection.js';
import { nudgeObjects } from '../svg/transform.js';
import { showHandles } from '../editor/handles.js';
import { saveHistory } from '../editor/history.js';
import { flushRealtime3D } from '../three/realtime.js';
import { resizeThree } from '../three/engine.js';

export function toggleLeftPanel() {
  ctx.dom.app.classList.toggle('lpanel-hidden');
  resizeThree();
}

export function initKeyboard() {
  const { dom, interaction, state } = ctx;

  document.addEventListener('keydown', (e) => {
    const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;

    if (inField) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      toggleLeftPanel();
      return;
    }

    if (e.key === ' ') {
      interaction.spaceDown = true;
      dom.mainSvg.style.cursor = 'grab';
      e.preventDefault();
    }

    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && e.key === 's') {
      e.preventDefault();
      exportSVG();
    }
    if (mod && e.key === 'a') {
      e.preventDefault();
      state.objects.forEach((o) => selectObj(o.id, true));
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey) deleteSelected();
    if (e.key === 'Escape') {
      deselectAll();
      if (state.penPoints.length) finishPen();
      if (state.polyPoints.length) clearPolyPreview();
    }
    if (e.key === 'Enter' && state.tool === 'poly' && state.polyPoints.length) {
      e.preventDefault();
      finishPoly(true);
    }
    if (!e.ctrlKey) {
      const tool = TOOL_SHORTCUTS[e.key];
      if (tool) {
        const b = document.querySelector(`[data-tool="${tool}"]`);
        if (b) b.click();
      }
      if (e.key === '+') setZoom(state.zoom * 1.25);
      if (e.key === '-') setZoom(state.zoom * 0.8);

      if (state.selected.length && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeObjects(state.selected, dx, dy);
        showHandles();
        updateProps();
        saveHistory();
        flushRealtime3D();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      interaction.spaceDown = false;
      dom.mainSvg.style.cursor = 'default';
    }
  });
}
