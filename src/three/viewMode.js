import { THREE } from './setup.js';
import { ctx } from '../core/context.js';
import { getThreeMat, updateSceneLights } from './materials.js';
import { renderThreeFrame } from './engine.js';

function removeEdgeLines(mesh) {
  const line = mesh.userData.edgeLines;
  if (!line) return;
  mesh.remove(line);
  line.geometry?.dispose();
  line.material?.dispose();
  mesh.userData.edgeLines = null;
}

function addEdgeLines(mesh) {
  if (mesh.userData.edgeLines) return;
  const topology = mesh.geometry?.userData?.topologyPositions;
  const edges = topology?.length
    ? new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(topology, 3),
    )
    : new THREE.EdgesGeometry(mesh.geometry, 18);
  const mat = new THREE.LineBasicMaterial({
    color: topology?.length ? 0xffa12a : 0x0a0a12,
    transparent: true,
    opacity: topology?.length ? 0.95 : 0.9,
  });
  const line = new THREE.LineSegments(edges, mat);
  line.renderOrder = 1;
  mesh.add(line);
  mesh.userData.edgeLines = line;
}

function materialTypeForMode(mode) {
  const mat = ctx.dom.d3Mat?.value || 'phong';
  if (mode === 'textured') {
    return mat === 'wireframe' || mat === 'flat' ? 'phong' : mat;
  }
  if (mode === 'solid' || mode === 'solid-lines') return 'flat';
  return 'wireframe';
}

function setMeshMaterial(mesh, color, mode) {
  const next = getThreeMat(color, materialTypeForMode(mode));
  const isTopologyMesh = !!mesh.geometry?.userData?.topologyPositions?.length;
  const isSilhouetteCage = !!mesh.geometry?.userData?.silhouetteSolid;

  if (isTopologyMesh && (mode === 'wireframe' || (isSilhouetteCage && mode === 'solid-lines'))) {
    next.wireframe = false;
    next.transparent = true;
    next.opacity = isSilhouetteCage ? 0.08 : 0.16;
    next.depthWrite = false;
  }
  if (mesh.material && mesh.material !== next) mesh.material.dispose();
  mesh.material = next;
}

/** Re-apply materials, lights, and display mode without rebuilding geometry */
export function refresh3DAppearance() {
  if (!ctx.meshes3d.length) return false;
  applyViewMode(ctx.state.viewMode3d);
  updateSceneLights();
  renderThreeFrame();
  return true;
}

/** Apply display mode to all current 3D meshes (no geometry rebuild) */
export function applyViewMode(mode = ctx.state.viewMode3d) {
  ctx.state.viewMode3d = mode;
  ctx.meshes3d.forEach((mesh) => {
    if (!mesh.isMesh) return;
    const color = mesh.userData.fillColor || '#888888';
    removeEdgeLines(mesh);

    if (mode === 'wireframe') {
      setMeshMaterial(mesh, color, 'wireframe');
      if (mesh.geometry?.userData?.topologyPositions?.length) addEdgeLines(mesh);
      return;
    }

    setMeshMaterial(mesh, color, mode);
    if (mode === 'solid-lines') addEdgeLines(mesh);
  });

  syncViewModeUi(mode);
}

export function setViewMode3d(mode) {
  applyViewMode(mode);
  updateSceneLights();
  renderThreeFrame();
}

export function syncViewModeUi(mode = ctx.state.viewMode3d) {
  document.querySelectorAll('[data-d3-view]').forEach((el) => {
    const on = el.dataset.d3View === mode;
    if (el.tagName === 'OPTION') el.selected = on;
    else el.classList.toggle('on', on);
  });
  const sel = ctx.dom.d3ViewMode;
  if (sel && sel.value !== mode) sel.value = mode;
}

export function initViewModeControls() {
  document.querySelectorAll('[data-d3-view]').forEach((el) => {
    if (el.tagName === 'OPTION') return;
    el.addEventListener('click', () => setViewMode3d(el.dataset.d3View));
  });
  if (ctx.dom.d3ViewMode) {
    ctx.dom.d3ViewMode.onchange = (e) => setViewMode3d(e.target.value);
  }
  syncViewModeUi();
}
