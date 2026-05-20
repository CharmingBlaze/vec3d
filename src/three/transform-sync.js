import { ctx } from '../core/context.js';
import { scheduleRealtime3D, flushRealtime3D } from './realtime.js';

/** Shift existing 3D meshes for a live translate without a full rebuild. */
export function apply3DTranslateDelta(ids, dx, dy) {
  if (!dx && !dy) return false;
  const { meshes3d, three } = ctx;
  if (!meshes3d?.length || !three?.renderer) return false;

  const idSet = new Set(ids);
  let moved = false;
  meshes3d.forEach((mesh) => {
    if (!idSet.has(mesh.userData.sourceObjectId)) return;
    mesh.position.x += dx;
    mesh.position.y -= dy;
    moved = true;
  });

  if (moved) {
    import('./engine.js').then(({ renderThreeFrame }) => renderThreeFrame());
  }
  return moved;
}

/** Live 3D update while using the select tool (move / rotate / scale). */
export function syncSelectTool3D(ids, { dx = 0, dy = 0, transform = false } = {}) {
  if (!ids?.length) return;

  if (!transform && (dx || dy) && apply3DTranslateDelta(ids, dx, dy)) {
    return;
  }

  scheduleRealtime3D();
}

/** Final accurate 3D sync after a select-tool drag ends. */
export function finishSelectTool3D() {
  flushRealtime3D();
}
