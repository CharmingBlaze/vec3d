import { THREE, THREE_CONFIG } from './setup.js';
import { ctx } from '../core/context.js';
import { fitCameraToCanvas, updateOrthographicCamera } from './camera.js';

export { fitCameraToCanvas, updateOrthographicCamera };

function activeCarea() {
  const { dom, state } = ctx;
  return state.activeScreen === '3d' ? dom.carea3d : dom.carea2d;
}

export function renderThreeFrame() {
  const { three } = ctx;
  if (three.renderer && three.scene && three.camera) {
    three.renderer.render(three.scene, three.camera);
  }
}

export function setThreeBackground(color) {
  const { three, state } = ctx;
  state.bg3d = color;
  if (three.renderer) {
    three.renderer.setClearColor(color, 1);
    renderThreeFrame();
  }
}

export function initThree() {
  const { three, dom, state } = ctx;
  if (three.renderer) return;

  const canvas = dom.threeCanvas;
  three.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  three.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, THREE_CONFIG.maxPixelRatio),
  );
  three.renderer.setClearColor(state.bg3d || THREE_CONFIG.clearColor, 1);
  three.renderer.shadowMap.enabled = true;

  three.scene = new THREE.Scene();
  three.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, THREE_CONFIG.cameraNear, THREE_CONFIG.cameraFar);

  const light = +dom.d3Light.value / 100;
  three.scene.add(new THREE.AmbientLight(0xffffff, 0.45 * light));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1 * light);
  dl.position.set(500, 700, 600);
  dl.castShadow = true;
  three.scene.add(dl);
  const rl = new THREE.DirectionalLight(0x6699ff, 0.4 * light);
  rl.position.set(-600, -200, 300);
  three.scene.add(rl);
  const pl = new THREE.PointLight(0x00e5ff, 0.5, 6000);
  pl.position.set(-400, 400, 300);
  three.scene.add(pl);

  three.group = new THREE.Group();
  three.scene.add(three.group);

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      state.drag3 = true;
      state.three.rotating = true;
    } else if (e.button === 0 || e.button === 1) {
      state.pan3 = true;
      if (e.button === 1) e.preventDefault();
    }
    state.lm3 = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('mousemove', (e) => {
    if (state.drag3) {
      three.group.rotation.y += (e.clientX - state.lm3.x) * 0.013;
      three.group.rotation.x += (e.clientY - state.lm3.y) * 0.013;
    }
    if (state.pan3) {
      three.group.position.x += (e.clientX - state.lm3.x) * 0.8;
      three.group.position.y -= (e.clientY - state.lm3.y) * 0.8;
    }
    state.lm3 = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2) state.drag3 = false;
    if (e.button === 0 || e.button === 1) state.pan3 = false;
  });
  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      const nextZoom = three.camera.zoom * (e.deltaY < 0 ? 1.08 : 0.92);
      three.camera.zoom = Math.max(0.15, Math.min(8, nextZoom));
      three.camera.updateProjectionMatrix();
    },
    { passive: true },
  );

  fitCameraToCanvas();

  function loop() {
    three.animId = requestAnimationFrame(loop);
    three.renderer.render(three.scene, three.camera);
  }
  loop();
}

export function resizeThree() {
  const { three, dom } = ctx;
  const area = activeCarea();
  let w = area?.clientWidth || 0;
  let h = area?.clientHeight || 0;
  if (!w || !h) {
    w = dom.carea2d?.clientWidth || dom.carea3d?.clientWidth || 1;
    h = dom.carea2d?.clientHeight || dom.carea3d?.clientHeight || 1;
  }
  if (!dom.threeCanvas) return;
  dom.threeCanvas.width = w;
  dom.threeCanvas.height = h;
  if (three.renderer) {
    three.renderer.setSize(w, h);
    if (ctx.meshes3d.length) fitCameraToCanvas();
    else updateOrthographicCamera();
    renderThreeFrame();
  }
}
