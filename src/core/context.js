import { createState } from './state.js';

/** Shared application context passed to modules */
export const ctx = {
  state: createState(),
  dom: {},
  /** @type {import('../scene/scene-graph.js').SceneGraph | null} */
  scene: null,
  objCounter: 0,
  meshes3d: [],
  three: {
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    overlayMesh: null,
    animId: null,
  },
  interaction: {
    isDragging: false,
    dragType: null,
    panStart: null,
    spaceDown: false,
  },
};

export function nextObjectId() {
  return `obj_${++ctx.objCounter}`;
}

export function getObj(id) {
  return ctx.scene?.get(id) ?? ctx.state.objects.find((o) => o.id === id) ?? null;
}

export function getScene() {
  return ctx.scene;
}
