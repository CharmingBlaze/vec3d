/**
 * Central Three.js entry point (npm package `three`).
 * All 3D modules should import from here so Vite bundles one consistent build.
 */
export * as THREE from 'three';

/** Renderer defaults used across the app */
export const THREE_CONFIG = {
  clearColor: 0x0e0f18,
  cameraFov: 50,
  cameraNear: 0.1,
  cameraFar: 50000,
  cameraZ: 800,
  maxPixelRatio: 2,
  autoRotateSpeed: 0.004,
};
