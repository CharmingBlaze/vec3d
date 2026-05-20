import { ctx, getObj, getScene } from '../core/context.js';
import { addObject } from '../editor/objects.js';
import { saveHistory } from '../editor/history.js';
import { onObjMouseDown } from '../canvas/handlers.js';
import { svgEl } from '../svg/elements.js';
import { parsePath, buildPath } from '../svg/path.js';
import { getEditorBBox, mapToEditor } from '../svg/geometry.js';
import { refreshLayers } from '../ui/layers.js';
import { flushRealtime3D } from '../three/realtime.js';
import polygonClipping from 'polygon-clipping';

export function importSVG() {
  const { state } = ctx;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.svg,image/svg+xml';
  inp.onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const doc = new DOMParser().parseFromString(ev.target.result, 'image/svg+xml');
      const imported = collectDrawableElements(doc.documentElement);
      imported.forEach((el) => {
        const clone = document.importNode(el.node, true);
        clone.removeAttribute('id');
        const inheritedTransform = el.transforms.join(' ');
        const ownTransform = clone.getAttribute('transform') || '';
        if (inheritedTransform || ownTransform) {
          clone.setAttribute('transform', `${inheritedTransform} ${ownTransform}`.trim());
        }
        const type = clone.tagName.toLowerCase();
        const fill = clone.getAttribute('fill') || el.fill || state.fill;
        const stroke = clone.getAttribute('stroke') || el.stroke || 'none';
        const opacity = clone.getAttribute('opacity') || el.opacity;
        clone.setAttribute('fill', fill);
        clone.setAttribute('stroke', stroke);
        if (opacity) clone.setAttribute('opacity', opacity);
        addObject(clone, type);
      });
      saveHistory();
      flushRealtime3D();
    };
    r.readAsText(f);
  };
  inp.click();
}

function collectDrawableElements(root) {
  const drawable = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text']);
  const out = [];

  const walk = (node, inherited) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    const next = {
      transforms: [...inherited.transforms],
      fill: node.getAttribute('fill') || inherited.fill,
      stroke: node.getAttribute('stroke') || inherited.stroke,
      opacity: node.getAttribute('opacity') || inherited.opacity,
    };
    const t = node.getAttribute('transform');
    if (t && !drawable.has(tag)) next.transforms.push(t);

    if (drawable.has(tag)) {
      out.push({ node, ...next });
      return;
    }
    node.childNodes.forEach((child) => walk(child, next));
  };

  walk(root, { transforms: [], fill: '', stroke: '', opacity: '' });
  return out;
}

export function exportSVG() {
  const { state, dom } = ctx;
  getScene()?.syncOrderFromDom();
  getScene()?.syncPropsFromDom();
  const bg = `<rect width="100%" height="100%" fill="${state.bg2d}" />`;
  const svgOut = `<svg xmlns="http://www.w3.org/2000/svg" width="${state.canvasW}" height="${state.canvasH}">${bg}${dom.shapesLayer.innerHTML}</svg>`;
  const a = document.createElement('a');
  a.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOut)}`;
  a.download = 'vec3d_export.svg';
  a.click();
}

function replaceWithPath(o, d) {
  const el = o.el;
  const p = svgEl('path', {
    d,
    fill: el.getAttribute('fill') || o.fill,
    stroke: el.getAttribute('stroke') || o.stroke,
    'stroke-width': el.getAttribute('stroke-width') || o.sw,
    opacity: el.getAttribute('opacity') ?? o.op,
  });
  p.dataset.id = o.id;
  p.addEventListener('mousedown', onObjMouseDown);
  el.replaceWith(p);
  o.el = p;
  o.type = 'path';
}

export function initPathOps() {
  const { dom } = ctx;

  dom.opFlatten.onclick = () => {
    ctx.state.selected.forEach((id) => {
      const o = getObj(id);
      if (!o) return;
      const el = o.el;
      const tag = el.tagName.toLowerCase();

      if (tag === 'rect') {
        const x = +el.getAttribute('x') || 0;
        const y = +el.getAttribute('y') || 0;
        const w = +el.getAttribute('width') || 0;
        const h = +el.getAttribute('height') || 0;
        const rx = +el.getAttribute('rx') || 0;
        if (rx > 0) {
          replaceWithPath(
            o,
            `M ${x + rx} ${y} L ${x + w - rx} ${y} Q ${x + w} ${y} ${x + w} ${y + rx} L ${x + w} ${y + h - rx} Q ${x + w} ${y + h} ${x + w - rx} ${y + h} L ${x + rx} ${y + h} Q ${x} ${y + h} ${x} ${y + h - rx} L ${x} ${y + rx} Q ${x} ${y} ${x + rx} ${y} Z`,
          );
        } else {
          replaceWithPath(o, `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
        }
      } else if (tag === 'ellipse' || tag === 'circle') {
        const cx = +el.getAttribute('cx') || 0;
        const cy = +el.getAttribute('cy') || 0;
        const rx = +el.getAttribute('rx') || +el.getAttribute('r') || 0;
        const ry = +el.getAttribute('ry') || +el.getAttribute('r') || 0;
        const segs = 32;
        let d = '';
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const px = cx + Math.cos(a) * rx;
          const py = cy + Math.sin(a) * ry;
          d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
        }
        replaceWithPath(o, `${d} Z`);
      } else if (tag === 'polygon' || tag === 'polyline') {
        const pts = (el.getAttribute('points') || '').trim();
        replaceWithPath(o, `M ${pts.replace(/,/g, ' ')}${tag === 'polygon' ? ' Z' : ''}`);
      } else if (tag === 'line') {
        const x1 = +el.getAttribute('x1') || 0;
        const y1 = +el.getAttribute('y1') || 0;
        const x2 = +el.getAttribute('x2') || 0;
        const y2 = +el.getAttribute('y2') || 0;
        const sw = +el.getAttribute('stroke-width') || 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * sw * 0.5;
        const ny = (dx / len) * sw * 0.5;
        replaceWithPath(
          o,
          `M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} L ${x2 - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`,
        );
      }
    });
    saveHistory();
    refreshLayers();
    flushRealtime3D();
  };

  dom.opReverse.onclick = () => {
    ctx.state.selected.forEach((id) => {
      const o = getObj(id);
      if (!o || o.type !== 'path') return;
      const pts = parsePath(o.el.getAttribute('d'));
      pts.reverse();
      pts.forEach((pt) => {
        [pt.c1x, pt.c2x] = [pt.c2x, pt.c1x];
        [pt.c1y, pt.c2y] = [pt.c2y, pt.c1y];
      });
      o.el.setAttribute('d', buildPath(pts));
    });
    saveHistory();
    flushRealtime3D();
  };

  dom.opClose.onclick = () => {
    ctx.state.selected.forEach((id) => {
      const o = getObj(id);
      if (!o) return;
      const tag = o.el.tagName.toLowerCase();
      if (tag === 'path') {
        const d = o.el.getAttribute('d') || '';
        if (!/[zZ]\s*$/.test(d.trim())) o.el.setAttribute('d', `${d.trim()} Z`);
      } else if (tag === 'polyline') {
        const pts = o.el.getAttribute('points') || '';
        replaceWithPath(o, `M ${pts.replace(/,/g, ' ')} Z`);
      }
    });
    saveHistory();
    flushRealtime3D();
  };

  const runBoolean = (mode) => {
    if (ctx.state.selected.length < 2) {
      alert('Select at least 2 layers for boolean operations.');
      return;
    }
    const items = ctx.state.selected.map((id) => getObj(id)).filter(Boolean);
    const geoms = items.map(objectToBooleanGeom).filter(Boolean);
    if (geoms.length < 2) {
      alert('Could not read enough filled layer outlines for this boolean operation.');
      return;
    }
    let result;
    if (mode === 'union') result = polygonClipping.union(...geoms);
    if (mode === 'subtract') result = polygonClipping.difference(geoms[0], ...geoms.slice(1));
    if (mode === 'intersect') result = polygonClipping.intersection(...geoms);
    if (mode === 'xor') result = polygonClipping.xor(...geoms);
    const d = multiPolygonToPath(result);
    if (!d) {
      alert('This boolean operation produced an empty shape.');
      return;
    }
    getScene().removeMany(items.map((o) => o.id));
    const first = items[0].el;
    const el = svgEl('path', {
      d,
      'fill-rule': 'evenodd',
      fill: first.getAttribute('fill') || items[0].fill || ctx.state.fill,
      stroke: first.getAttribute('stroke') || items[0].stroke || ctx.state.stroke,
      'stroke-width': first.getAttribute('stroke-width') || items[0].sw || ctx.state.strokeW,
      opacity: first.getAttribute('opacity') ?? items[0].op ?? 1,
    });
    const no = addObject(el, 'path');
    getScene().setSelection([no.id]);
    saveHistory();
    refreshLayers();
    flushRealtime3D();
  };

  dom.opBool.onclick = () => runBoolean('union');
  if (dom.opSubtract) dom.opSubtract.onclick = () => runBoolean('subtract');
  if (dom.opIntersect) dom.opIntersect.onclick = () => runBoolean('intersect');
  if (dom.opXor) dom.opXor.onclick = () => runBoolean('xor');
}

function objectToBooleanGeom(o) {
  const el = o.el;
  const tag = el.tagName.toLowerCase();
  let ring = null;
  if (tag === 'path') ring = samplePathRing(el);
  else if (tag === 'rect') ring = rectRing(el);
  else if (tag === 'circle' || tag === 'ellipse') ring = ellipseRing(el);
  else if (tag === 'polygon' || tag === 'polyline') ring = pointsRing(el);
  else if (tag === 'line') ring = lineStrokeRing(el);
  else ring = bboxRing(el);
  ring = cleanRing(ring);
  return ring ? [[ring]] : null;
}

function samplePathRing(el) {
  try {
    const len = el.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return bboxRing(el);
    const count = Math.max(24, Math.min(240, Math.ceil(len / 4)));
    const pts = [];
    for (let i = 0; i < count; i++) {
      const p = el.getPointAtLength((i / count) * len);
      const q = mapToEditor(el, p.x, p.y);
      pts.push([q.x, q.y]);
    }
    return pts;
  } catch {
    return bboxRing(el);
  }
}

function rectRing(el) {
  const x = +el.getAttribute('x') || 0;
  const y = +el.getAttribute('y') || 0;
  const w = +el.getAttribute('width') || 0;
  const h = +el.getAttribute('height') || 0;
  const rx = Math.min(+el.getAttribute('rx') || 0, w / 2);
  const ry = Math.min(+el.getAttribute('ry') || rx, h / 2);
  if (!rx && !ry) return mapRing(el, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const pts = [];
  addArc(pts, x + w - rx, y + ry, rx, ry, -Math.PI / 2, 0);
  addArc(pts, x + w - rx, y + h - ry, rx, ry, 0, Math.PI / 2);
  addArc(pts, x + rx, y + h - ry, rx, ry, Math.PI / 2, Math.PI);
  addArc(pts, x + rx, y + ry, rx, ry, Math.PI, Math.PI * 1.5);
  return mapRing(el, pts);
}

function ellipseRing(el) {
  const cx = +el.getAttribute('cx') || 0;
  const cy = +el.getAttribute('cy') || 0;
  const rx = +el.getAttribute('rx') || +el.getAttribute('r') || 0;
  const ry = +el.getAttribute('ry') || +el.getAttribute('r') || 0;
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return mapRing(el, pts);
}

function pointsRing(el) {
  const nums = (el.getAttribute('points') || '').match(/-?[\d.]+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return mapRing(el, pts);
}

function lineStrokeRing(el) {
  const x1 = +el.getAttribute('x1') || 0;
  const y1 = +el.getAttribute('y1') || 0;
  const x2 = +el.getAttribute('x2') || 0;
  const y2 = +el.getAttribute('y2') || 0;
  const sw = Math.max(1, +el.getAttribute('stroke-width') || 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * sw * 0.5;
  const ny = (dx / len) * sw * 0.5;
  return mapRing(el, [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]);
}

function bboxRing(el) {
  try {
    const bb = getEditorBBox(el);
    return [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x + bb.width, bb.y + bb.height], [bb.x, bb.y + bb.height]];
  } catch {
    return null;
  }
}

function addArc(out, cx, cy, rx, ry, a0, a1) {
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
}

function mapRing(el, pts) {
  return pts.map(([x, y]) => {
    const p = mapToEditor(el, x, y);
    return [p.x, p.y];
  });
}

function cleanRing(ring) {
  if (!ring || ring.length < 3) return null;
  const out = [];
  ring.forEach((p) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.01) out.push(p);
  });
  if (out.length < 3 || Math.abs(ringArea(out)) < 0.5) return null;
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) out.push([...first]);
  return out;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function multiPolygonToPath(multiPolygon) {
  if (!multiPolygon?.length) return '';
  const parts = [];
  multiPolygon.forEach((polygon) => {
    polygon.forEach((ring) => {
      const cleaned = cleanRing(ring);
      if (!cleaned) return;
      const pts = cleaned.slice(0, -1);
      parts.push(`M ${pts.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ')} Z`);
    });
  });
  return parts.join(' ');
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
