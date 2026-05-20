import { svgEl } from './elements.js';
import { ctx } from '../core/context.js';

export function makePolygon(cx, cy, r, sides, attrs) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return svgEl('polygon', { points: pts.join(' '), ...attrs });
}

export function makeStar(cx, cy, r, ir, pts, attrs) {
  const p = [];
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const rad = i % 2 ? ir : r;
    p.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
  }
  return svgEl('polygon', { points: p.join(' '), ...attrs });
}

export function makeShapePreset(name, cx, cy, w, h) {
  const { state } = ctx;
  const r = Math.min(w, h) / 2;
  const attrs = {
    fill: state.fillMode === 'none' ? 'none' : state.fill,
    stroke: state.stroke,
    'stroke-width': state.strokeW,
    opacity: state.opacity / 100,
  };
  let el;
  switch (name) {
    case 'roundsquare': {
      const side = Math.min(w, h);
      const corner = Math.max(2, side * 0.22);
      el = svgEl('rect', {
        x: cx - side / 2,
        y: cy - side / 2,
        width: side,
        height: side,
        rx: corner,
        ry: corner,
        ...attrs,
      });
      break;
    }
    case 'oval':
      el = svgEl('ellipse', { cx, cy, rx: w / 2, ry: h / 2, ...attrs });
      break;
    case 'roundrect':
      el = svgEl('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 10, ...attrs });
      break;
    case 'triangle': {
      const d = `M ${cx} ${cy - r} L ${cx + r} ${cy + r} L ${cx - r} ${cy + r} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'diamond': {
      const d = `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'hexagon':
      el = makePolygon(cx, cy, r, 6, attrs);
      break;
    case 'star5':
      el = makeStar(cx, cy, r, r * 0.42, 5, attrs);
      break;
    case 'star6':
      el = makeStar(cx, cy, r, r * 0.6, 6, attrs);
      break;
    case 'heart': {
      const d = [
        `M ${cx} ${cy + r * 0.78}`,
        `C ${cx - r * 1.15} ${cy + r * 0.1} ${cx - r} ${cy - r * 0.85} ${cx - r * 0.38} ${cy - r * 0.72}`,
        `C ${cx - r * 0.1} ${cy - r * 0.66} ${cx} ${cy - r * 0.42} ${cx} ${cy - r * 0.22}`,
        `C ${cx} ${cy - r * 0.42} ${cx + r * 0.1} ${cy - r * 0.66} ${cx + r * 0.38} ${cy - r * 0.72}`,
        `C ${cx + r} ${cy - r * 0.85} ${cx + r * 1.15} ${cy + r * 0.1} ${cx} ${cy + r * 0.78}`,
        'Z',
      ].join(' ');
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'arrow': {
      const d = `M ${cx - r} ${cy - r * 0.25} L ${cx} ${cy - r * 0.25} L ${cx} ${cy - r * 0.5} L ${cx + r} ${cy} L ${cx} ${cy + r * 0.5} L ${cx} ${cy + r * 0.25} L ${cx - r} ${cy + r * 0.25} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'cross': {
      const t = r * 0.3;
      const d = `M ${cx - t} ${cy - r} L ${cx + t} ${cy - r} L ${cx + t} ${cy - t} L ${cx + r} ${cy - t} L ${cx + r} ${cy + t} L ${cx + t} ${cy + t} L ${cx + t} ${cy + r} L ${cx - t} ${cy + r} L ${cx - t} ${cy + t} L ${cx - r} ${cy + t} L ${cx - r} ${cy - t} L ${cx - t} ${cy - t} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'moon': {
      const d = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r * 0.65} ${r * 0.65} 0 1 0 ${cx} ${cy - r} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'speech': {
      const d = `M ${cx - r} ${cy - r * 0.6} Q ${cx - r} ${cy - r} ${cx - r * 0.5} ${cy - r} L ${cx + r * 0.5} ${cy - r} Q ${cx + r} ${cy - r} ${cx + r} ${cy - r * 0.6} L ${cx + r} ${cy + r * 0.3} Q ${cx + r} ${cy + r * 0.7} ${cx + r * 0.5} ${cy + r * 0.7} L ${cx} ${cy + r * 0.7} L ${cx - 0.3 * r} ${cy + r} L ${cx - 0.1 * r} ${cy + r * 0.7} L ${cx - r * 0.5} ${cy + r * 0.7} Q ${cx - r} ${cy + r * 0.7} ${cx - r} ${cy + r * 0.3} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    case 'cloud': {
      const d = `M ${cx - r * 0.3} ${cy + r * 0.2} A ${r * 0.45} ${r * 0.45} 0 1 1 ${cx + r * 0.3} ${cy + r * 0.2} A ${r * 0.38} ${r * 0.38} 0 1 1 ${cx + r * 0.7} ${cy + r * 0.2} A ${r * 0.3} ${r * 0.3} 0 0 1 ${cx + r} ${cy + r * 0.4} L ${cx - r} ${cy + r * 0.4} A ${r * 0.3} ${r * 0.3} 0 0 1 ${cx - r * 0.7} ${cy + r * 0.2} A ${r * 0.38} ${r * 0.38} 0 1 1 ${cx - 0.3 * r} ${cy + r * 0.2} Z`;
      el = svgEl('path', { d, ...attrs });
      break;
    }
    default:
      el = svgEl('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...attrs });
  }
  return el;
}
