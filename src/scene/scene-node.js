import { defaultTransform } from '../svg/transform.js';

/** @returns {import('./types.js').SceneNode} */
export function createSceneNode({ id, el, type, fill, stroke, sw, op, data = {} }) {
  return {
    id,
    el,
    type,
    fill,
    stroke,
    sw,
    op,
    visible: true,
    locked: false,
    data: { ...data, transform: data.transform ?? defaultTransform() },
  };
}

export function serializeNode(node) {
  return {
    id: node.id,
    type: node.type,
    fill: node.fill,
    stroke: node.stroke,
    sw: node.sw,
    op: node.op,
    visible: node.visible !== false,
    locked: !!node.locked,
    data: node.data,
  };
}
