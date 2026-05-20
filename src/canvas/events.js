import { ctx, getObj } from '../core/context.js';
import { shouldDrawAsTube } from '../core/tube-mode.js';
import { DRAW_TOOLS } from '../core/constants.js';
import { svgEl } from '../svg/elements.js';
import { svgPoint, setZoom, applyTransform } from '../svg/coordinates.js';
import { getEditorBBox } from '../svg/geometry.js';
import { addObject } from '../editor/objects.js';
import { syncSelectTool3D, finishSelectTool3D } from '../three/transform-sync.js';
import { scheduleRealtime3D } from '../three/realtime.js';
import { saveHistory } from '../editor/history.js';
import { moveObjects, startMoveDrag, applyRotateDrag, applyScaleDrag } from '../svg/transform.js';
import { deselectAll, selectObj, updateProps } from '../editor/selection.js';
import { showHandles, showNodeHandles, updatePath } from '../editor/handles.js';
import { penClick, finishPen, dragPenCurve } from '../tools/pen.js';
import { polyClick, updatePolyPreview, finishPoly } from '../tools/poly.js';
import { finishPencilStroke } from '../tools/pencil.js';
import { finishTubeStroke } from '../tools/tube.js';
import { startShapePreview, updateShapePreview, finishShapePreview } from '../tools/shape-draw.js';

export function initCanvasEvents() {
  const { dom, interaction } = ctx;
  const { mainSvg } = dom;

  mainSvg.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && interaction.spaceDown)) {
      interaction.panStart = { x: e.clientX - ctx.state.panX, y: e.clientY - ctx.state.panY };
      return;
    }
    if (e.button === 0) onCanvasDown(e);
  });

  mainSvg.addEventListener('mousemove', onMouseMove);
  mainSvg.addEventListener('mouseup', onMouseUp);
  mainSvg.addEventListener('dblclick', () => {
    if (ctx.state.tool === 'pen') finishPen(true);
    if (ctx.state.tool === 'poly') finishPoly(true);
  });

  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);

  mainSvg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = svgPoint(e);
      setZoom(ctx.state.zoom * (e.deltaY < 0 ? 1.1 : 0.9), p);
    },
    { passive: false },
  );
}

function onCanvasDown(e) {
  const { state, interaction } = ctx;
  const p = svgPoint(e);

  if (state.tool === 'pen') {
    penClick(e);
    if (state.penPoints.length) {
      interaction.isDragging = true;
      interaction.dragType = 'pen-curve';
    }
    return;
  }
  if (state.tool === 'poly') {
    polyClick(e);
    return;
  }
  if (state.tool === 'pencil' || state.tool === 'tube') {
    const isTube = shouldDrawAsTube();
    state.pencilPts = [p];
    state.pencilEl = svgEl('path', {
      d: `M ${p.x} ${p.y}`,
      fill: 'none',
      stroke: isTube ? '#a855f7' : '#818cf8',
      'stroke-width': Math.max(2, state.strokeW),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: isTube ? 'tube-preview guide-path' : 'pencil-preview guide-path',
    });
    ctx.dom.previewLayer.appendChild(state.pencilEl);
    interaction.isDragging = true;
    interaction.dragType = isTube ? 'tube' : 'pencil';
    return;
  }
  if (DRAW_TOOLS.includes(state.tool)) {
    startShapePreview(e);
    interaction.isDragging = true;
    interaction.dragType = 'shape';
    return;
  }
  if (state.tool === 'text') {
    const txt = prompt('Enter text:', 'Hello');
    if (!txt) return;
    const el = svgEl('text', {
      x: p.x,
      y: p.y,
      fill: state.fill,
      'font-size': 24,
      'font-family': 'Syne, sans-serif',
    });
    el.textContent = txt;
    const o = addObject(el, 'text');
    selectObj(o.id);
    return;
  }
  if (state.tool === 'zoom-in') {
    setZoom(state.zoom * 1.25, p);
    return;
  }
  if (state.tool === 'zoom-out') {
    setZoom(state.zoom * 0.8, p);
    return;
  }
  if (state.tool === 'select' || state.tool === 'node') {
    if (state.selected.length && pointInSelection(p)) {
      startMoveDrag(p);
      interaction.isDragging = true;
      return;
    }
    deselectAll();
    interaction.isDragging = true;
    interaction.dragType = 'selbox';
    state.selDragStart = p;
    const r = svgEl('rect', { x: p.x, y: p.y, width: 0, height: 0, class: 'sel-box' });
    ctx.dom.previewLayer.appendChild(r);
    state.shapePreview = r;
  }
}

function pointInSelection(p) {
  return ctx.state.selected.some((id) => {
    const o = getObj(id);
    if (!o?.el) return false;
    try {
      const bb = getEditorBBox(o.el);
      return (
        p.x >= bb.x &&
        p.x <= bb.x + bb.width &&
        p.y >= bb.y &&
        p.y <= bb.y + bb.height
      );
    } catch {
      return false;
    }
  });
}

function onWindowMouseMove(e) {
  if (!ctx.interaction.isDragging && !ctx.interaction.panStart) return;
  onMouseMove(e);
}

function onWindowMouseUp(e) {
  if (!ctx.interaction.isDragging && !ctx.interaction.panStart) return;
  onMouseUp(e);
}

function onMouseMove(e) {
  const { state, dom, interaction } = ctx;
  const p = svgPoint(e);
  dom.sbXy.textContent = `X: ${Math.round(p.x)}  Y: ${Math.round(p.y)}`;

  if (interaction.panStart) {
    state.panX = e.clientX - interaction.panStart.x;
    state.panY = e.clientY - interaction.panStart.y;
    applyTransform();
    return;
  }
  if (state.tool === 'poly' && state.polyPoints.length) {
    updatePolyPreview(p);
    return;
  }

  if (!interaction.isDragging) return;

  if (interaction.dragType === 'pencil' || interaction.dragType === 'tube') {
    state.pencilPts.push(p);
    const cur = state.pencilEl;
    cur.setAttribute('d', `${cur.getAttribute('d')} L ${p.x} ${p.y}`);
    return;
  }
  if (interaction.dragType === 'pen-curve') {
    dragPenCurve(e);
    return;
  }
  if (interaction.dragType === 'shape') {
    updateShapePreview(e);
    return;
  }
  if (interaction.dragType === 'selbox' && state.selDragStart && state.shapePreview) {
    const s = state.selDragStart;
    state.shapePreview.setAttribute('x', Math.min(s.x, p.x));
    state.shapePreview.setAttribute('y', Math.min(s.y, p.y));
    state.shapePreview.setAttribute('width', Math.abs(p.x - s.x));
    state.shapePreview.setAttribute('height', Math.abs(p.y - s.y));
    return;
  }
  if (interaction.dragType === 'move' && state.selDragOffset) {
    const dx = p.x - state.selDragOffset.x;
    const dy = p.y - state.selDragOffset.y;
    if (dx || dy) {
      moveObjects(state.selected, dx, dy);
      state.selDragOffset = p;
      showHandles();
      updateProps();
      syncSelectTool3D(state.selected, { dx, dy });
    }
    return;
  }
  if (interaction.dragType === 'handle' && state.draggingHandle) {
    const o = getObj(state.draggingHandle.oid);
    if (!o) return;
    if (state.draggingHandle.handleType === 'rotate') {
      applyRotateDrag(o, state.draggingHandle.snap, p);
    } else if (state.draggingHandle.handleType === 'scale') {
      applyScaleDrag(o, state.draggingHandle.snap, p);
    }
    showHandles();
    updateProps();
    syncSelectTool3D([o.id], { transform: true });
    return;
  }
  if (interaction.dragType === 'node' && state.draggingHandle?.type === 'node') {
    const { idx, ctrl, oid, nodeKind } = state.draggingHandle;
    if (idx === undefined) return;
    const pt = state.nodeHandles[+idx];
    if (!pt) return;
    if (ctrl === 'anchor') {
      const dx = p.x - pt.x;
      const dy = p.y - pt.y;
      pt.x = p.x;
      pt.y = p.y;
      if (pt.c1x !== undefined) {
        pt.c1x += dx;
        pt.c1y += dy;
      }
      if (pt.c2x !== undefined) {
        pt.c2x += dx;
        pt.c2y += dy;
      }
    } else if (ctrl === 'c1') {
      pt.c1x = p.x;
      pt.c1y = p.y;
    } else if (ctrl === 'c2') {
      pt.c2x = p.x;
      pt.c2y = p.y;
    }
    updatePath(oid, nodeKind);
    showNodeHandles();
    ctx.scene?.notifyGeometry([oid]);
    scheduleRealtime3D();
  }
}

function onMouseUp(e) {
  const { state, interaction } = ctx;
  interaction.panStart = null;

  if (interaction.dragType === 'pencil') finishPencilStroke();
  else if (interaction.dragType === 'tube') finishTubeStroke(state.pencilPts);
  else if (interaction.dragType === 'shape') finishShapePreview(e);
  else if (interaction.dragType === 'selbox') {
    ctx.dom.previewLayer.innerHTML = '';
    state.shapePreview = null;
    if (state.selDragStart) {
      const p = svgPoint(e);
      const bx = Math.min(state.selDragStart.x, p.x);
      const by = Math.min(state.selDragStart.y, p.y);
      const bw = Math.abs(p.x - state.selDragStart.x);
      const bh = Math.abs(p.y - state.selDragStart.y);
      if (bw > 4 || bh > 4) {
        state.objects.forEach((o) => {
          try {
            const bb = getEditorBBox(o.el);
            if (bb.x + bb.width > bx && bb.y + bb.height > by && bb.x < bx + bw && bb.y < by + bh) {
              selectObj(o.id, true);
            }
          } catch {
            /* empty */
          }
        });
      }
      state.selDragStart = null;
    }
  } else if (
    interaction.dragType === 'move' ||
    interaction.dragType === 'handle' ||
    interaction.dragType === 'node'
  ) {
    saveHistory();
    finishSelectTool3D();
  }

  state.draggingHandle = null;
  interaction.isDragging = false;
  interaction.dragType = null;
}
