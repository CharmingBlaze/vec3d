import { THREE } from './setup.js';
import { ctx } from '../core/context.js';

export function getThreeMat(color, matType, shineOverride) {
  const c = new THREE.Color(color === 'none' ? '#888888' : color);
  const shine = shineOverride ?? +ctx.dom.d3Shine.value;
  const type = matType || ctx.dom.d3Mat.value;

  switch (type) {
    case 'toon':
      return new THREE.MeshToonMaterial({ color: c, side: THREE.DoubleSide });
    case 'standard':
      return new THREE.MeshStandardMaterial({ color: c, metalness: 0.8, roughness: 0.15, side: THREE.DoubleSide });
    case 'wireframe':
      return new THREE.MeshBasicMaterial({ color: c, wireframe: true });
    case 'glass':
      return new THREE.MeshPhongMaterial({
        color: c,
        transparent: true,
        opacity: 0.35,
        shininess: 200,
        specular: new THREE.Color('#ffffff'),
        side: THREE.DoubleSide,
      });
    case 'flat':
      return new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    default:
      return new THREE.MeshPhongMaterial({
        color: c,
        shininess: shine,
        specular: new THREE.Color('#666666'),
        side: THREE.DoubleSide,
      });
  }
}

export function updateSceneLights() {
  const { three, dom } = ctx;
  if (!three.scene) return;
  const l = +dom.d3Light.value / 100;
  three.scene.children
    .filter((c) => c.isLight)
    .forEach((lt) => {
      if (lt.isAmbientLight) lt.intensity = 0.45 * l;
      else if (lt.isDirectionalLight) lt.intensity = lt.color.getHex() === 0x6699ff ? 0.4 * l : 1.1 * l;
      else lt.intensity = 0.5 * l;
    });
}
