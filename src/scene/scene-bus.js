/** Lightweight pub/sub for scene-wide system wiring */
export class SceneBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, detail = {}) {
    this._handlers.get(event)?.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.warn(`SceneBus handler error (${event}):`, err);
      }
    });
  }
}

export const SceneEvents = {
  CHANGED: 'scene:changed',
  STRUCTURE: 'scene:structure',
  SELECTION: 'scene:selection',
  TRANSFORM: 'scene:transform',
  STYLE: 'scene:style',
  HISTORY: 'scene:history',
};
