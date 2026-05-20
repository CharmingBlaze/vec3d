import { ctx } from '../core/context.js';
import { readElementStyle } from '../svg/geometry.js';
import { createSceneNode, serializeNode } from './scene-node.js';
import { SceneBus, SceneEvents } from './scene-bus.js';

/**
 * Central scene graph — single source of truth for document objects,
 * draw order, selection, visibility, and transform/style metadata.
 */
export class SceneGraph {
  constructor(state) {
    this.state = state;
    this.bus = new SceneBus();
    /** @type {import('./types.js').SceneNode[]} */
    this.nodes = state.objects;
    this.selected = state.selected;
    this.version = 0;
    this.last3DVersion = -1;
    this.lastSaveVersion = -1;
    this.dirty3d = true;
    this.dirtySave = true;
  }

  get(id) {
    return this.nodes.find((n) => n.id === id) ?? null;
  }

  getAll() {
    return this.nodes;
  }

  /** Bottom → top draw order (visible only) */
  getVisibleNodes() {
    return this.nodes.filter((n) => n.visible !== false && n.el?.style.display !== 'none');
  }

  getSelection() {
    return [...this.selected];
  }

  isSelected(id) {
    return this.selected.includes(id);
  }

  /** Register a new node; appends to shapes layer if el provided */
  addNode({ el, type, fill, stroke, sw, op, data, id }) {
    const node = createSceneNode({
      id: id ?? `obj_${++ctx.objCounter}`,
      el,
      type,
      fill: fill ?? this.state.fill,
      stroke: stroke ?? this.state.stroke,
      sw: sw ?? this.state.strokeW,
      op: op ?? this.state.opacity / 100,
      data,
    });
    if (el) {
      el.dataset.id = node.id;
      el.setAttribute('class', 'vec-el');
    }
    this.nodes.push(node);
    this.bus.emit(SceneEvents.STRUCTURE, { reason: 'add', id: node.id });
    this.markDirty('add');
    return node;
  }

  removeNode(id) {
    const node = this.get(id);
    if (!node) return false;
    node.el?.remove();
    this.state.objects = this.nodes = this.nodes.filter((n) => n.id !== id);
    this.selected = this.state.selected = this.selected.filter((sid) => sid !== id);
    this.markDirty('remove');
    this.bus.emit(SceneEvents.STRUCTURE, { reason: 'remove', id });
    return true;
  }

  removeMany(ids) {
    ids.forEach((id) => {
      const node = this.get(id);
      if (node && !node.locked) {
        node.el?.remove();
      }
    });
    const removeSet = new Set(ids);
    this.state.objects = this.nodes = this.nodes.filter(
      (n) => !removeSet.has(n.id) || n.locked,
    );
    this.selected = this.state.selected = this.selected.filter((id) => !removeSet.has(id));
    this.markDirty('remove-many');
    this.bus.emit(SceneEvents.STRUCTURE, { reason: 'remove-many', ids });
  }

  setSelection(ids, mode = 'replace') {
    if (mode === 'replace') {
      this.selected.length = 0;
      this.state.selected.length = 0;
    }
    ids.forEach((id) => {
      const node = this.get(id);
      if (!node || node.locked || node.visible === false) return;
      if (!this.selected.includes(id)) {
        this.selected.push(id);
        this.state.selected.push(id);
      }
    });
    this.bus.emit(SceneEvents.SELECTION, { ids: this.getSelection() });
  }

  clearSelection() {
    this.selected.length = 0;
    this.state.selected.length = 0;
    this.bus.emit(SceneEvents.SELECTION, { ids: [] });
  }

  /** Move selected nodes up in z-order (toward front) */
  moveUp(ids) {
    const layer = ctx.dom.shapesLayer;
    if (!layer) return;
    ids.forEach((id) => {
      const node = this.get(id);
      if (node?.el) layer.appendChild(node.el);
    });
    this.syncOrderFromDom();
    this.notifyChanged('reorder');
  }

  moveDown(ids) {
    const layer = ctx.dom.shapesLayer;
    if (!layer) return;
    [...ids].reverse().forEach((id) => {
      const node = this.get(id);
      if (node?.el) layer.insertBefore(node.el, layer.firstChild);
    });
    this.syncOrderFromDom();
    this.notifyChanged('reorder');
  }

  setVisible(id, visible) {
    const node = this.get(id);
    if (!node) return;
    node.visible = visible;
    if (node.el) node.el.style.display = visible ? '' : 'none';
    if (!visible) {
      this.selected = this.state.selected = this.selected.filter((sid) => sid !== id);
    }
    this.notifyChanged('visibility');
  }

  setLocked(id, locked) {
    const node = this.get(id);
    if (!node) return;
    node.locked = locked;
    if (node.el) node.el.style.pointerEvents = locked ? 'none' : '';
    if (locked) {
      this.selected = this.state.selected = this.selected.filter((sid) => sid !== id);
    }
    this.notifyChanged('lock');
  }

  /** Match node array order to shapes-layer DOM (bottom → top) */
  syncOrderFromDom() {
    const layer = ctx.dom.shapesLayer;
    if (!layer) return;
    const ids = [...layer.querySelectorAll('[data-id]')].map((el) => el.dataset.id);
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    this.nodes.forEach((n) => {
      if (!ids.includes(n.id)) ordered.push(n);
    });
    this.state.objects = this.nodes = ordered;
  }

  /** Pull fill/stroke/opacity from SVG elements */
  syncPropsFromDom() {
    this.nodes.forEach((node) => {
      if (!node.el) return;
      const style = readElementStyle(node);
      node.fill = style.fill;
      node.stroke = style.stroke;
      node.sw = style.sw;
      node.op = style.op;
      if (node.el.style.display === 'none') node.visible = false;
    });
  }

  prepareFor3D() {
    this.syncOrderFromDom();
    this.syncPropsFromDom();
    return this.getVisibleNodes();
  }

  clear() {
    this.nodes.length = 0;
    this.state.objects.length = 0;
    this.clearSelection();
    ctx.dom.shapesLayer.innerHTML = '';
    this.bus.emit(SceneEvents.STRUCTURE, { reason: 'clear' });
  }

  serializeNodes() {
    return this.nodes.map(serializeNode);
  }

  /** Restore nodes from history snapshot + SVG html */
  restoreFromSnapshot(svgHtml, serializedNodes, bindEl, selectedIds = []) {
    ctx.dom.shapesLayer.innerHTML = svgHtml;
    this.state.objects = this.nodes = serializedNodes
      .map((data) => {
        const el = ctx.dom.shapesLayer.querySelector(`[data-id="${data.id}"]`);
        if (el && bindEl) bindEl(el);
        if (el) {
          el.style.display = data.visible === false ? 'none' : '';
          el.style.pointerEvents = data.locked ? 'none' : '';
        }
        return { ...data, el };
      })
      .filter((n) => n.el);
    const valid = selectedIds.filter((id) => this.get(id));
    if (valid.length) this.setSelection(valid);
    else this.clearSelection();
    this.markDirty('restore');
    this.bus.emit(SceneEvents.HISTORY, { reason: 'restore' });
  }

  notifyChanged(reason = 'edit', extra = {}) {
    this.markDirty(reason);
    this.bus.emit(SceneEvents.CHANGED, { reason, ...extra });
  }

  notifyTransform(ids) {
    this.markDirty('transform');
    this.bus.emit(SceneEvents.TRANSFORM, { ids });
  }

  notifyStyle(ids) {
    this.markDirty('style');
    this.bus.emit(SceneEvents.STYLE, { ids });
  }

  notifyGeometry(ids) {
    this.markDirty('geometry');
    this.bus.emit(SceneEvents.CHANGED, { reason: 'geometry', ids });
  }

  markDirty(reason = 'edit') {
    this.version += 1;
    this.dirty3d = true;
    this.dirtySave = true;
    this.state.sceneVersion = this.version;
    this.state.sceneDirtyReason = reason;
  }

  mark3DClean() {
    this.last3DVersion = this.version;
    this.dirty3d = false;
  }

  markSaveClean() {
    this.lastSaveVersion = this.version;
    this.dirtySave = false;
  }

  on(event, fn) {
    return this.bus.on(event, fn);
  }
}
