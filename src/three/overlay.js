import { THREE } from './setup.js';
import { ctx } from '../core/context.js';

/**
 * Flat 2D artboard snapshot inside the 3D group — same frame as the editor canvas
 * so extruded meshes line up with the artwork when viewed front-on.
 */
export function sync2DOverlay(depth, onReady) {
  const { dom, three, state } = ctx;
  if (!three.group) return;

  remove2DOverlay();

  const w = state.canvasW;
  const h = state.canvasH;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#ffffff"/>
  ${dom.shapesLayer.innerHTML}
</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = () => {
    const tex = new THREE.CanvasTexture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, -depth / 2 + 0.01);
    mesh.renderOrder = -1;
    three.group.add(mesh);
    three.overlayMesh = mesh;
    URL.revokeObjectURL(url);
    onReady?.();
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    onReady?.();
  };

  img.src = url;
}

export function remove2DOverlay() {
  const { three } = ctx;
  if (!three.overlayMesh) return;
  three.group?.remove(three.overlayMesh);
  three.overlayMesh.geometry.dispose();
  three.overlayMesh.material.map?.dispose();
  three.overlayMesh.material.dispose();
  three.overlayMesh = null;
}
