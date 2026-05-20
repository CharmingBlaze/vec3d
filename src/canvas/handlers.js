import { ctx, getObj } from '../core/context.js';
import { selectObj } from '../editor/selection.js';
import { svgPoint } from '../svg/coordinates.js';
import { getEditorBBox } from '../svg/geometry.js';
import {
  beginRotateDrag,
  beginScaleDrag,
  startMoveDrag,
} from '../svg/transform.js';
import { showNodeHandles, showHandles } from '../editor/handles.js';

export function onObjMouseDown(e) {
  const { state } = ctx;
  e.stopPropagation();
  if (state.tool === 'pen') return;
  const id = e.currentTarget.dataset.id;
  const o = getObj(id);
  if (o?.locked || o?.visible === false) return;
  selectObj(id, e.shiftKey);
  if (e.detail === 2 && state.tool === 'select') {
    state.tool = 'node';
    document.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tool === 'node');
    });
    ctx.dom.sbTool.textContent = 'Tool: node';
    showNodeHandles();
    return;
  }
  if (state.tool === 'node') showNodeHandles();
  else showHandles();
  if (state.tool === 'select') startMoveDrag(svgPoint(e));
}

export function onMoveSurfaceDown(e) {
  e.stopPropagation();
  if (ctx.state.tool !== 'select' || !ctx.state.selected.length) return;
  startMoveDrag(svgPoint(e));
}

export function onHandleDown(e) {
  e.stopPropagation();
  const { state, interaction } = ctx;
  const o = getObj(e.currentTarget.dataset.oid);
  if (!o) return;

  const bb = getEditorBBox(o.el);
  const p = svgPoint(e);

  if (e.currentTarget.dataset.handleType === 'rotate') {
    interaction.isDragging = true;
    interaction.dragType = 'handle';
    state.draggingHandle = {
      handleType: 'rotate',
      oid: o.id,
      snap: beginRotateDrag(o, p),
    };
    return;
  }

  const corner = +e.currentTarget.dataset.corner;
  const HANDLE_ANCHORS = [
    [bb.x + bb.width, bb.y + bb.height],
    [bb.x, bb.y + bb.height],
    [bb.x + bb.width, bb.y],
    [bb.x, bb.y],
    [bb.x + bb.width / 2, bb.y + bb.height],
    [bb.x + bb.width / 2, bb.y],
    [bb.x + bb.width, bb.y + bb.height / 2],
    [bb.x, bb.y + bb.height / 2],
  ];
  const [ax, ay] = HANDLE_ANCHORS[corner] || [bb.x + bb.width / 2, bb.y + bb.height / 2];

  interaction.isDragging = true;
  interaction.dragType = 'handle';
  state.draggingHandle = {
    handleType: 'scale',
    oid: o.id,
    snap: beginScaleDrag(o, ax, ay, corner),
  };
}

export function onNodeHandleDown(e) {
  e.stopPropagation();
  const { nodeIdx, ctrl, oid, nodeKind } = e.currentTarget.dataset;
  ctx.state.draggingHandle = {
    type: 'node',
    idx: +nodeIdx,
    ctrl,
    oid,
    nodeKind,
    el: e.currentTarget,
  };
  ctx.interaction.isDragging = true;
  ctx.interaction.dragType = 'node';
}
