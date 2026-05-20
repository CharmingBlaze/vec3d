import { THREE } from './setup.js';
import { ctx, getObj, getScene } from '../core/context.js';
import { initThree } from './engine.js';
import { elemToThreeShapes } from './converter.js';
import { getThreeMat } from './materials.js';
import { remove2DOverlay } from './overlay.js';
import { editorToThree, mapToEditor, readElementStyle } from '../svg/geometry.js';
import { fitCameraToCanvas } from './camera.js';
import { applyViewMode } from './viewMode.js';
import { createCapsuleGeometry } from './capsule-geometry.js';
import { createRoundedTubeMesh } from './tube-mesh.js';
import { createRoundedSilhouetteGeometry } from './silhouette-tube.js';
import { parsePath, flattenPathPoints, sampleSvgPath, isClosedLoop } from '../svg/path.js';
import { shouldUseTubeMesh, tubeRadiusFromDepth } from '../core/tube-mode.js';
import { getObjectD3 } from '../core/d3-settings.js';
function disposeMesh(mesh) {
  if (!mesh) return;
  const edge = mesh.userData?.edgeLines;
  if (edge) {
    edge.geometry?.dispose();
    edge.material?.dispose();
  }
  mesh.geometry?.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m?.dispose());
  else mat?.dispose();
}

/** Clear meshes without switching screens */
export function clear3DMeshes() {
  const { three, meshes3d } = ctx;
  meshes3d.forEach(disposeMesh);
  meshes3d.length = 0;
  if (three.group) three.group.clear();
  remove2DOverlay();
}

/**
 * Rebuild 3D from current 2D scene.
 * @param {{ preserveCamera?: boolean, silent?: boolean, fitCamera?: boolean }} opts
 */
export function rebuild3D(opts = {}) {
  const { preserveCamera = false, silent = false, fitCamera = false } = opts;
  const { state, dom, three, meshes3d } = ctx;
  getScene()?.prepareFor3D();
  const objs = getScene()?.getVisibleNodes() ?? [];

  if (!objs.length) {
    clear3DMeshes();
    return false;
  }

  initThree();

  const prevRot = three.group.rotation.clone();
  const prevPos = three.group.position.clone();
  const prevZoom = three.camera?.zoom ?? 1;

  meshes3d.forEach(disposeMesh);
  meshes3d.length = 0;
  three.group.clear();
  remove2DOverlay();

  const cx = state.canvasW / 2;
  const cy = state.canvasH / 2;
  state.sceneCenter = { cx, cy };

  if (!preserveCamera) {
    three.group.rotation.set(0, 0, 0);
    three.group.position.set(0, 0, 0);
  }

  objs.forEach((o) => {
    const d3 = getObjectD3(o);
    ctx.d3BuildContext = d3;

    let cseg = d3.cseg;
    const settings = profileSettings(d3.profile, {
      depth: d3.depth,
      bevel: d3.bevel,
      roundness: d3.round,
      bseg: d3.bseg,
    });
    if (settings.maxCurveSegments) cseg = Math.min(cseg, settings.maxCurveSegments);
    if (settings.tubeProfile) cseg = Math.max(cseg, 12);

    const style = readElementStyle(o);
    const fillCol = style.fill === 'none' ? style.stroke || '#888888' : style.fill;

    const tubeGeometry = buildTubeGeometryForObject(o, style, cx, cy, d3.profile, settings, cseg, d3.depth);
    if (tubeGeometry) {
      const mesh = new THREE.Mesh(tubeGeometry, getThreeMat(fillCol, d3.mat, d3.shine));
      mesh.name = `${o.type || 'object'}_${o.id || meshes3d.length + 1}`;
      mesh.userData.sourceObjectId = o.id;
      mesh.userData.sourceName = mesh.name;
      mesh.userData.fillColor = fillCol;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      three.group.add(mesh);
      meshes3d.push(mesh);
      return;
    }

    const shapes = elemToThreeShapes(o.el, cx, cy);
    if (!shapes.length) return;

    shapes.forEach((shape) => {
      let geo;
      let centered = false;
      try {
        if (settings.unifiedCaps) {
          geo = createCapsuleGeometry(shape, settings.dome, settings.bodyDepth ?? 0, cseg, {
            bevel: settings.bevel,
            thickness: settings.thickness,
            bevelSegments: settings.bevelSegments,
          });
          if (geo) {
            centered = true;
          } else {
            geo = new THREE.ExtrudeGeometry(shape, {
              depth: d3.depth,
              bevelEnabled: settings.bevel > 0,
              bevelSize: settings.bevel,
              bevelThickness: settings.thickness,
              bevelSegments: settings.bevelSegments,
              steps: settings.steps,
              curveSegments: cseg,
            });
          }
        } else {
          geo = new THREE.ExtrudeGeometry(shape, {
            depth: d3.depth,
            bevelEnabled: settings.bevel > 0,
            bevelSize: settings.bevel,
            bevelThickness: settings.thickness,
            bevelSegments: settings.bevelSegments,
            steps: settings.steps,
            curveSegments: cseg,
          });
        }
      } catch (err) {
        console.warn('Extrude error', err);
        return;
      }

      const mesh = new THREE.Mesh(geo, getThreeMat(fillCol, d3.mat, d3.shine));
      mesh.name = `${o.type || 'object'}_${o.id || meshes3d.length + 1}`;
      mesh.userData.sourceObjectId = o.id;
      mesh.userData.sourceName = mesh.name;
      mesh.userData.fillColor = fillCol;
      mesh.position.set(0, 0, centered ? 0 : -d3.depth / 2);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      three.group.add(mesh);
      meshes3d.push(mesh);
    });
  });

  if (!meshes3d.length) {
    if (!silent) {
      alert('Could not convert shapes to 3D. Try Close Path or Flatten to Path first.');
    }
    return false;
  }

  if (preserveCamera) {
    three.group.rotation.copy(prevRot);
    three.group.position.copy(prevPos);
    if (three.camera) {
      three.camera.zoom = prevZoom;
      three.camera.updateProjectionMatrix();
    }
  } else if (fitCamera) {
    fitCameraToCanvas();
  }

  applyViewMode(state.viewMode3d);
  getScene()?.mark3DClean();

  return true;
}

function pathToCenterline(el) {
  if (!el || el.tagName?.toLowerCase() !== 'path') return [];
  const pts = parsePath(el.getAttribute('d') || '');
  return pts.map((p) => ({ x: p.x, y: p.y }));
}

function pathIsClosed(o) {
  if (o.data?.closed) return true;
  const d = (o.el?.getAttribute('d') || '').trim();
  return /[zZ]\s*$/.test(d);
}

function getObjectCenterline(o, cseg) {
  const tag = o.el?.tagName?.toLowerCase();

  if (tag === 'line') {
    const p1 = mapToEditor(o.el, +o.el.getAttribute('x1'), +o.el.getAttribute('y1'));
    const p2 = mapToEditor(o.el, +o.el.getAttribute('x2'), +o.el.getAttribute('y2'));
    return [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
    ];
  }
  if (tag === 'polyline') {
    const nums = (o.el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const p = mapToEditor(o.el, nums[i], nums[i + 1]);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  if (tag === 'path' && o.el?.isConnected) {
    const sampled = sampleSvgPath(o.el, 2);
    if (sampled?.length >= 2) return sampled;
  }

  let pts;
  if (o.data?.centerline?.length >= 2) {
    pts = o.data.centerline.map((p) => mapToEditor(o.el, p.x, p.y));
  } else if (o.data?.pts?.length >= 2) {
    pts = o.data.pts.map((p) => {
      const mapped = mapToEditor(o.el, p.x, p.y);
      return {
        ...p,
        x: mapped.x,
        y: mapped.y,
        ...(p.c1x !== undefined ? mapControlPoint(o.el, p, 'c1') : {}),
        ...(p.c2x !== undefined ? mapControlPoint(o.el, p, 'c2') : {}),
      };
    });
  } else if (tag === 'path') {
    pts = parsePath(o.el.getAttribute('d') || '');
  } else {
    return [];
  }

  if (!pts?.length) return [];

  const hasHandles = pts.some((p) => p.c1x !== undefined || p.c2x !== undefined);
  const dense = hasHandles ? flattenPathPoints(pts, Math.max(8, Math.ceil(cseg / 2))) : pts;

  if (pathIsClosed(o) || isClosedLoop(dense)) {
    const first = dense[0];
    const last = dense[dense.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 2) dense.pop();
  }

  return dense;
}

function mapControlPoint(el, point, key) {
  const mapped = mapToEditor(el, point[`${key}x`], point[`${key}y`]);
  return { [`${key}x`]: mapped.x, [`${key}y`]: mapped.y };
}

function isClosedCenterline(pts, o) {
  if (o?.data?.closed || pathIsClosed(o)) return true;
  return isClosedLoop(pts);
}

function hasVisibleFill(style) {
  return style.fill && style.fill !== 'none' && style.fill !== 'transparent';
}

function shapeFromEditorPoints(points, cx, cy) {
  if (!points || points.length < 3) return null;
  const shape = new THREE.Shape();
  points.forEach((pt, i) => {
    const p = editorToThree(pt.x, pt.y, cx, cy);
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  return shape;
}

function isClosedSilhouetteCandidate(o, cseg) {
  const tag = o.el?.tagName?.toLowerCase();
  if (!['path', 'polygon', 'ellipse', 'circle', 'rect'].includes(tag)) return false;
  if (tag !== 'path') return true;
  if (pathIsClosed(o) || o.data?.closed) return true;
  const pts = getObjectCenterline(o, cseg);
  return isClosedLoop(pts);
}

function buildSilhouetteTubeForObject(o, style, cx, cy, profile, settings, cseg, depth) {
  const forceSilhouette = o.data?.tubeSilhouette === true;
  if (profile !== 'tube' && !forceSilhouette) return null;
  const closedSilhouette = isClosedSilhouetteCandidate(o, cseg);
  if (!hasVisibleFill(style) && !closedSilhouette) return null;

  const shapes = elemToThreeShapes(o.el, cx, cy);
  if (!shapes.length && closedSilhouette) {
    const fallback = shapeFromEditorPoints(getObjectCenterline(o, cseg), cx, cy);
    if (fallback) shapes.push(fallback);
  }
  if (!shapes.length) return null;

  const outlineSegments = Math.max(8, Math.min(28, cseg * 2));
  const rings = Math.max(9, Math.min(15, Math.round(depth / 24) * 2 + 7));
  const parts = [];
  shapes.forEach((shape) => {
    const geo = createRoundedSilhouetteGeometry(shape, depth, {
      outlineSegments,
      rings,
      simplify: profile === 'tube' || forceSilhouette ? 2 : 3,
      roundAmount: Math.max(0.2, Math.min(0.78, depth / 180)),
    });
    if (geo) parts.push(geo);
  });

  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];

  const group = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const indices = [];
  let offset = 0;
  parts.forEach((geo) => {
    const pos = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }
    const srcIndex = geo.index?.array || [];
    for (let i = 0; i < srcIndex.length; i++) indices.push(srcIndex[i] + offset);
    if (geo.userData?.topologyPositions?.length) {
      if (!group.userData.topologyPositions) group.userData.topologyPositions = [];
      group.userData.topologyPositions.push(...geo.userData.topologyPositions);
    }
    if (geo.userData?.silhouetteSolid) group.userData.silhouetteSolid = true;
    offset += pos.count;
    geo.dispose();
  });
  group.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  group.setIndex(indices);
  group.computeVertexNormals();
  return group;
}

function buildTubeGeometryForObject(o, style, cx, cy, profile, settings, cseg, depth) {
  const silhouette = buildSilhouetteTubeForObject(o, style, cx, cy, profile, settings, cseg, depth);
  if (silhouette) return silhouette;

  if (profile === 'tube' && isClosedSilhouetteCandidate(o, cseg)) return null;
  if (!shouldUseTubeMesh(o, style, profile)) return null;
  if (profile === 'tube' && hasVisibleFill(style)) return null;

  const centerline = getObjectCenterline(o, cseg);
  if (centerline.length < 2) return null;

  const closed = isClosedCenterline(centerline, o);
  const radius = tubeRadiusFromDepth(style.sw, depth, profile);

  const pathLen = centerline.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const prev = centerline[i - 1];
    return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0);
  const tubularSegments = o.data?.tubularSegments
    ?? Math.max(48, Math.ceil(pathLen / 3));

  try {
    return createRoundedTubeMesh(centerline, radius, cx, cy, {
      radialSegments: Math.max(16, o.data?.radialSegments ?? cseg),
      tubularSegments,
      closed,
    });
  } catch (err) {
    console.warn('Tube mesh error', err);
    return null;
  }
}

/** @deprecated use rebuild3D */
export function generate3D() {
  return rebuild3D({ fitCamera: true, preserveCamera: false, silent: false });
}

function profileSettings(profile, raw) {
  const round = raw.roundness / 100;
  const userBevel = Math.max(0, raw.bevel);
  const userBseg = Math.max(raw.bseg, userBevel > 0 ? 3 : 1);
  const thickness = userBevel > 0 ? Math.max(userBevel * 0.75, 0.5) : 0;

  // End Round slider → hemispherical front/back caps (all profiles)
  const capH = round > 0 ? (raw.depth / 2) * round : 0;
  const endCaps = capH > 0.01;
  const bodyDepth = endCaps ? Math.max(0, raw.depth - 2 * capH) : raw.depth;
  const endCapFields = endCaps
    ? { dome: capH, bodyDepth, unifiedCaps: true }
    : { dome: 0, bodyDepth: raw.depth, unifiedCaps: false };

  if (profile === 'game') {
    return {
      bevel: userBevel,
      thickness,
      bevelSegments: userBevel > 0 ? Math.max(userBseg, 3) : 1,
      steps: userBevel > 0 ? 2 : 1,
      maxCurveSegments: endCaps ? 16 : 6,
      ...endCapFields,
    };
  }
  if (profile === 'slab') {
    return {
      bevel: userBevel,
      thickness,
      bevelSegments: userBseg,
      steps: 1,
      maxCurveSegments: endCaps ? 16 : undefined,
      ...endCapFields,
    };
  }
  if (profile === 'capsule') {
    return {
      bevel: userBevel,
      thickness,
      bevelSegments: Math.max(userBseg, userBevel > 0 ? 4 : 8),
      steps: 1,
      maxCurveSegments: 24,
      ...endCapFields,
    };
  }
  if (profile === 'tube') {
    return {
      tubeProfile: true,
      radiusScale: Math.max(0.25, raw.depth / 40),
      bevel: 0,
      thickness: 0,
      bevelSegments: 1,
      steps: 1,
      maxCurveSegments: 32,
      dome: 0,
      bodyDepth: raw.depth,
      unifiedCaps: false,
    };
  }
  if (profile === 'inflated') {
    const bevel = userBevel > 0 ? userBevel : endCaps ? userBevel : Math.max(2, raw.depth * 0.08);
    return {
      bevel,
      thickness: Math.max(bevel * 0.9, thickness, bevel > 0 ? 0.5 : 0),
      bevelSegments: Math.max(userBseg, 8),
      steps: 4,
      maxCurveSegments: endCaps ? 20 : undefined,
      ...endCapFields,
    };
  }
  if (profile === 'outline') {
    const bevel = Math.max(userBevel, 1);
    return {
      bevel,
      thickness: Math.max(bevel * 0.45, thickness, 0.5),
      bevelSegments: Math.max(userBseg, 3),
      steps: 1,
      maxCurveSegments: endCaps ? 16 : undefined,
      ...endCapFields,
    };
  }
  return {
    bevel: userBevel,
    thickness,
    bevelSegments: userBseg,
    steps: 2,
    maxCurveSegments: endCaps ? 16 : undefined,
    ...endCapFields,
  };
}
