import { ctx, getObj } from '../core/context.js';
import { parsePath } from '../svg/path.js';
import { mapToEditor } from '../svg/geometry.js';
import { DRAW_TOOLS } from '../core/constants.js';
import { svgEl } from '../svg/elements.js';

const BASE_SNAP_RADIUS = 14;

export const DRAWING_SNAP_TOOLS = [
  'pen',
  'poly',
  'pencil',
  'tube',
  'midtube',
  'line',
  ...DRAW_TOOLS,
];

export function isDrawingSnapTool(tool = ctx.state.tool) {
  return DRAWING_SNAP_TOOLS.includes(tool);
}

function snapRadius() {
  return BASE_SNAP_RADIUS / Math.max(0.15, ctx.state.zoom || 1);
}

function parsePointsAttr(points = '') {
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

function mapAnchorToEditor(el, pt) {
  const p = mapToEditor(el, pt.x, pt.y);
  const out = { x: p.x, y: p.y };
  if (pt.c1x !== undefined) {
    const c1 = mapToEditor(el, pt.c1x, pt.c1y);
    out.c1x = c1.x;
    out.c1y = c1.y;
  }
  if (pt.c2x !== undefined) {
    const c2 = mapToEditor(el, pt.c2x, pt.c2y);
    out.c2x = c2.x;
    out.c2y = c2.y;
  }
  return out;
}

/** Anchor points for one object in editor space. */
export function getObjectAnchorPointsEditor(o) {
  if (!o?.el) return [];
  const tag = o.el.tagName.toLowerCase();
  let local = [];

  if (tag === 'path') {
    if (o.type === 'tube' && o.data?.centerline?.length) {
      local = o.data.centerline.map((p) => ({ ...p }));
    } else {
      local = parsePath(o.el.getAttribute('d') || '');
    }
  } else if (tag === 'polygon' || tag === 'polyline') {
    local = parsePointsAttr(o.el.getAttribute('points'));
  } else if (tag === 'line') {
    local = [
      { x: +o.el.getAttribute('x1') || 0, y: +o.el.getAttribute('y1') || 0 },
      { x: +o.el.getAttribute('x2') || 0, y: +o.el.getAttribute('y2') || 0 },
    ];
  } else {
    return [];
  }

  return local.map((pt) => mapAnchorToEditor(o.el, pt));
}

/** Collect snap targets from visible, unlocked path-like objects. */
export function collectSnapNodes(options = {}) {
  const {
    excludeOid = null,
    penPoints = [],
    polyPoints = [],
    pencilPts = [],
  } = options;

  const nodes = [];
  const scene = ctx.scene;
  const objects = scene?.getVisibleNodes?.() ?? ctx.state.objects;

  objects.forEach((o) => {
    if (!o?.el || o.locked || o.visible === false || o.id === excludeOid) return;
    const anchors = getObjectAnchorPointsEditor(o);
    if (!anchors.length) return;

    const tag = o.el.tagName.toLowerCase();
    const closed = tag === 'polygon';

    anchors.forEach((pt, index) => {
      const isEndpoint = closed || index === 0 || index === anchors.length - 1;
      nodes.push({
        oid: o.id,
        index,
        x: pt.x,
        y: pt.y,
        isEndpoint,
        closed,
      });
    });
  });

  penPoints.forEach((pt, index) => {
    nodes.push({
      oid: '__pen__',
      index,
      x: pt.x,
      y: pt.y,
      isEndpoint: index === 0 || index === penPoints.length - 1,
      isOwnStroke: true,
    });
  });

  polyPoints.forEach((pt, index) => {
    nodes.push({
      oid: '__poly__',
      index,
      x: pt.x,
      y: pt.y,
      isEndpoint: index === 0 || index === polyPoints.length - 1,
      isOwnStroke: true,
    });
  });

  if (pencilPts.length) {
    const first = pencilPts[0];
    const last = pencilPts[pencilPts.length - 1];
    nodes.push({
      oid: '__pencil__',
      index: 0,
      x: first.x,
      y: first.y,
      isEndpoint: true,
      isOwnStroke: true,
    });
    if (pencilPts.length > 1) {
      nodes.push({
        oid: '__pencil__',
        index: pencilPts.length - 1,
        x: last.x,
        y: last.y,
        isEndpoint: true,
        isOwnStroke: true,
      });
    }
  }

  return nodes;
}

/**
 * Find nearest snap node to cursor.
 * @returns {{ oid, index, x, y, isEndpoint, isOwnStroke, isOwnFirst } | null}
 */
export function findSnapTarget(point, options = {}) {
  if (!point) return null;
  const radius = snapRadius();
  const nodes = collectSnapNodes(options);

  let best = null;
  let bestDist = radius;

  nodes.forEach((node) => {
    const dist = Math.hypot(point.x - node.x, point.y - node.y);
    if (dist >= bestDist) return;

    if (node.isOwnStroke && options.penPoints?.length) {
      if (node.oid === '__pen__' && node.index !== 0) return;
      if (node.oid === '__poly__' && node.index !== 0) return;
    }
    if (node.isOwnStroke && options.pencilPts?.length && node.oid === '__pencil__') {
      return;
    }

    bestDist = dist;
    best = {
      ...node,
      isOwnFirst: node.isOwnStroke && node.index === 0,
    };
  });

  return best;
}

/** Resolve click/drag point with optional snap. */
export function resolveSnapPoint(point, options = {}) {
  const snap = findSnapTarget(point, options);
  if (!snap) return { x: point.x, y: point.y, snap: null };
  return { x: snap.x, y: snap.y, snap };
}

let highlightEl = null;

export function updateSnapHighlight(snap) {
  const { dom } = ctx;
  if (!snap) {
    clearSnapHighlight();
    return;
  }

  if (!highlightEl) {
    highlightEl = svgEl('circle', {
      r: 8,
      fill: 'rgba(255, 107, 53, 0.25)',
      stroke: '#ff6b35',
      'stroke-width': 2,
      class: 'snap-node-highlight',
      'pointer-events': 'none',
    });
    dom.previewLayer.appendChild(highlightEl);
  }

  highlightEl.setAttribute('cx', snap.x);
  highlightEl.setAttribute('cy', snap.y);
  highlightEl.setAttribute('r', snap.isEndpoint ? 9 : 7);
  highlightEl.style.display = '';
}

export function clearSnapHighlight() {
  if (highlightEl) {
    highlightEl.remove();
    highlightEl = null;
  }
}

export function snapRadiusPx() {
  return snapRadius();
}
