/** @typedef {{ tx: number, ty: number, rot: number, sx: number, sy: number }} TransformState */

/**
 * @typedef {Object} SceneNode
 * @property {string} id
 * @property {SVGElement} el
 * @property {string} type
 * @property {string} fill
 * @property {string} stroke
 * @property {number} sw
 * @property {number} op
 * @property {boolean} visible
 * @property {boolean} locked
 * @property {{ transform?: TransformState, [key: string]: unknown }} data
 */

export {};
