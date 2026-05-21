import { ctx } from '../core/context.js';
import { resizeThree } from '../three/engine.js';

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

export function applySplitRatio(ratio) {
  const { dom, state } = ctx;
  if (!dom.viewport || !dom.split2d) return;
  const clamped = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
  state.splitRatio = clamped;
  dom.viewport.style.setProperty('--split-left', `${clamped * 100}%`);
}

export function setSplitFocus(screen) {
  const { dom, state } = ctx;
  state.activeScreen = screen;
  applySplitRatio(screen === '3d' ? 0.32 : 0.68);
  dom.vtab2d?.classList.toggle('on', screen !== '3d');
  dom.vtab3d?.classList.toggle('on', screen === '3d');
  resizeThree();
}

export function initSplitView() {
  const { dom, state } = ctx;
  if (!dom.splitDivider || !dom.viewport) return;

  applySplitRatio(state.splitRatio ?? 0.5);

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const rect = dom.viewport.getBoundingClientRect();
    const x = e.clientX - rect.left;
    applySplitRatio(x / rect.width);
    resizeThree();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('split-dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  dom.splitDivider.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    document.body.classList.add('split-dragging');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  dom.splitDivider.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.08 : 0.03;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applySplitRatio((state.splitRatio ?? 0.5) - step);
      resizeThree();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applySplitRatio((state.splitRatio ?? 0.5) + step);
      resizeThree();
    }
  });
}
