import { ctx } from '../core/context.js';
import { SceneGraph } from './scene-graph.js';
import { SceneEvents } from './scene-bus.js';
import { scheduleRealtime3D, flushRealtime3D } from '../three/realtime.js';
import { refreshLayers, updateStatus } from '../ui/layers.js';
import { highlightSelectedFromScene } from '../editor/selection.js';
import { update3DGizmoAttachment } from '../three/gizmos.js';

/** Create scene graph and wire all subsystems through the event bus */
export function initSceneGraph() {
  ctx.scene = new SceneGraph(ctx.state);

  const scene = ctx.scene;

  const live3D = () => scheduleRealtime3D();

  scene.on(SceneEvents.CHANGED, live3D);
  scene.on(SceneEvents.STRUCTURE, () => {
    refreshLayers();
    live3D();
  });
  scene.on(SceneEvents.SELECTION, () => {
    highlightSelectedFromScene();
    updateStatus();
    update3DGizmoAttachment();
  });
  scene.on(SceneEvents.TRANSFORM, live3D);
  scene.on(SceneEvents.STYLE, live3D);
  scene.on(SceneEvents.HISTORY, () => {
    refreshLayers();
    flushRealtime3D();
  });

  return scene;
}
