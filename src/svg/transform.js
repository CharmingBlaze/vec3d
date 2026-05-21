import { ctx, getObj } from '../core/context.js';
import { pauseSceneSync, resumeSceneSync } from '../editor/scene-sync.js';
import { getEditorBBox } from './geometry.js';

export function defaultTransform() {
  return { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
}

function numeric(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTransform(tf = {}) {
  return {
    tx: numeric(tf.tx, 0),
    ty: numeric(tf.ty, 0),
    rot: numeric(tf.rot, 0),
    sx: numeric(tf.sx, 1),
    sy: numeric(tf.sy, 1),
  };
}

function withPausedSceneSync(fn) {
  pauseSceneSync();
  try {
    return fn();
  } finally {
    resumeSceneSync();
  }
}

/** Parse decomposed transform from an SVG transform attribute */
export function readTransformFromEl(el) {
  const str = el.getAttribute('transform') || '';
  const lead = parseLeadingTranslate(str);
  const rotM = str.match(/rotate\(\s*([-\d.eE+]+)/);
  const scaleM = str.match(/scale\(\s*([-\d.eE+]+)(?:[,\s]+([-\d.eE+]+))?\s*\)/);
  return {
    tx: lead.x,
    ty: lead.y,
    rot: rotM ? +rotM[1] : 0,
    sx: scaleM ? +scaleM[1] : 1,
    sy: scaleM ? +(scaleM[2] ?? scaleM[1]) : 1,
  };
}

export function parseLeadingTranslate(transformStr) {
  const t = (transformStr || '').trim();
  const m = t.match(/^translate\(\s*([-\d.eE+]+)(?:[,\s]+([-\d.eE+]+))?\s*\)/);
  if (!m) return { x: 0, y: 0, rest: t };
  return { x: +m[1], y: +(m[2] ?? 0), rest: t.slice(m[0].length).trim() };
}

/** Ensure object has a cached decomposed transform */
export function ensureObjTransform(o) {
  if (!o.data) o.data = {};
  if (!o.data.transform) o.data.transform = readTransformFromEl(o.el);
  o.data.transform = normalizeTransform(o.data.transform);
  return o.data.transform;
}

/** Write decomposed transform → SVG attribute (rotate/scale around local bbox center) */
export function writeTransformToEl(el, tf) {
  tf = normalizeTransform(tf);
  const bb = el.getBBox();
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  const parts = [];
  if (tf.tx || tf.ty) parts.push(`translate(${tf.tx},${tf.ty})`);
  parts.push(`translate(${cx},${cy})`);
  if (tf.rot) parts.push(`rotate(${tf.rot})`);
  if (tf.sx !== 1 || tf.sy !== 1) parts.push(`scale(${tf.sx},${tf.sy})`);
  parts.push(`translate(${-cx},${-cy})`);
  el.setAttribute('transform', parts.join(' '));
}

export function commitTransform(o, tf) {
  withPausedSceneSync(() => writeTransformToEl(o.el, tf));
  Object.assign(ensureObjTransform(o), tf);
  ctx.scene?.notifyTransform([o.id]);
}

export function readObjectBounds(o) {
  const bb = getEditorBBox(o.el);
  return {
    x: bb.x,
    y: bb.y,
    w: bb.width,
    h: bb.height,
    cx: bb.x + bb.width / 2,
    cy: bb.y + bb.height / 2,
  };
}

export function createTransformSnapshot(o) {
  const bb = getEditorBBox(o.el);
  return {
    tf: { ...ensureObjTransform(o) },
    editorBb: { x: bb.x, y: bb.y, width: bb.width, height: bb.height },
    pivotX: bb.x + bb.width / 2,
    pivotY: bb.y + bb.height / 2,
  };
}

export function moveObjects(ids, dx, dy) {
  if (!dx && !dy) return;
  const changed = [];
  withPausedSceneSync(() => {
    ids.forEach((id) => {
      const o = getObj(id);
      if (!o?.el || o.locked || o.visible === false) return;
      const tf = ensureObjTransform(o);
      tf.tx += dx;
      tf.ty += dy;
      writeTransformToEl(o.el, tf);
      changed.push(id);
    });
  });
  if (changed.length) ctx.scene?.notifyTransform(changed);
}

export function flipObjects(ids, axis) {
  const changed = [];
  withPausedSceneSync(() => {
    ids.forEach((id) => {
      const o = getObj(id);
      if (!o?.el || o.locked || o.visible === false) return;
      const tf = ensureObjTransform(o);
      if (axis === 'x') tf.sx *= -1;
      if (axis === 'y') tf.sy *= -1;
      writeTransformToEl(o.el, tf);
      changed.push(id);
    });
  });
  if (changed.length) ctx.scene?.notifyTransform(changed);
  return changed.length;
}

export function nudgeObjects(ids, dx, dy) {
  moveObjects(ids, dx, dy);
}

export function beginRotateDrag(o, pointer) {
  const snap = createTransformSnapshot(o);
  snap.startAngle =
    (Math.atan2(pointer.y - snap.pivotY, pointer.x - snap.pivotX) * 180) / Math.PI;
  return snap;
}

export function applyRotateDrag(o, snap, pointer) {
  const angle =
    (Math.atan2(pointer.y - snap.pivotY, pointer.x - snap.pivotX) * 180) / Math.PI;
  const tf = { ...snap.tf, rot: snap.tf.rot + (angle - snap.startAngle) };
  commitTransform(o, tf);
}

export function beginScaleDrag(o, anchorX, anchorY, corner) {
  return {
    ...createTransformSnapshot(o),
    anchorX,
    anchorY,
    corner: +corner,
  };
}

export function applyScaleDrag(o, snap, pointer) {
  const { editorBb: sb, tf: st, anchorX, anchorY, corner } = snap;
  const scaleXOnly = corner === 6 || corner === 7;
  const scaleYOnly = corner === 4 || corner === 5;

  let ratioX = 1;
  let ratioY = 1;
  if (!scaleYOnly) ratioX = Math.max(0.02, Math.abs(anchorX - pointer.x) / (sb.width || 1));
  if (!scaleXOnly) ratioY = Math.max(0.02, Math.abs(anchorY - pointer.y) / (sb.height || 1));

  const sx = st.sx * ratioX;
  const sy = st.sy * ratioY;
  const newX = anchorX + (sb.x - anchorX) * ratioX;
  const newY = anchorY + (sb.y - anchorY) * ratioY;

  commitTransform(o, {
    tx: st.tx + (newX - sb.x),
    ty: st.ty + (newY - sb.y),
    rot: st.rot,
    sx,
    sy,
  });
}

/** Apply transform panel values (absolute editor bbox + rotation + uniform scale) */
export function applyPanelTransform(o, panel) {
  const bb = getEditorBBox(o.el);
  const tf = { ...ensureObjTransform(o) };

  tf.tx += panel.x - bb.x;
  tf.ty += panel.y - bb.y;

  const targetW = Math.max(1, panel.w);
  const targetH = Math.max(1, panel.h);
  const sc = panel.scale ?? 1;
  if (targetW > 0 && bb.width > 0) tf.sx *= (targetW / bb.width) * sc;
  if (targetH > 0 && bb.height > 0) tf.sy *= (targetH / bb.height) * sc;

  if (panel.rot !== undefined && panel.rot !== null) tf.rot = panel.rot;

  commitTransform(o, tf);
}

export function startMoveDrag(point) {
  const { state, interaction } = ctx;
  interaction.isDragging = true;
  interaction.dragType = 'move';
  state.selDragOffset = point;
}

/** Sync transform panel fields from the first selected object */
export function syncTransformPanel(dom, o) {
  if (!o) return;
  try {
    const bounds = readObjectBounds(o);
    const tf = ensureObjTransform(o);
    dom.propX.value = Math.round(bounds.x);
    dom.propY.value = Math.round(bounds.y);
    dom.propW.value = Math.round(bounds.w);
    dom.propH.value = Math.round(bounds.h);
    dom.propR.value = Math.round(tf.rot);
    dom.propS.value = Math.round(((tf.sx + tf.sy) / 2) * 100) / 100;
  } catch {
    /* empty */
  }
}
