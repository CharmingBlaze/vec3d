/** @typedef {'low-poly' | 'clean-game' | 'blender-edit' | 'smooth'} TopologyPreset */

/**
 * @typedef {Object} PrepareOutlineOptions
 * @property {number} simplifyTolerance
 * @property {number} smoothPasses
 * @property {number} targetPointCount
 * @property {boolean} preserveCorners
 * @property {number} cornerAngleThresholdDeg
 * @property {number} minPointDistance
 */

export const TOPO_PRESETS = {
  'low-poly': {
    targetPointCount: 20,
    rings: 2,
    sideLoops: 1,
    inflation: 80,
    bevel: 14,
    innerRingStart: 0.28,
    evenRings: true,
    loopDetail: 'full',
    mergeEpsilon: 0.006,
    simplifyTolerance: 5,
    smoothPasses: 1,
    preserveCorners: true,
    cornerAngleThresholdDeg: 110,
    minPointDistance: 4,
  },
  'clean-game': {
    targetPointCount: 28,
    rings: 3,
    sideLoops: 1,
    inflation: 88,
    bevel: 16,
    innerRingStart: 0.24,
    evenRings: true,
    loopDetail: 'simple',
    mergeEpsilon: 0.008,
    simplifyTolerance: 4,
    smoothPasses: 1,
    preserveCorners: true,
    cornerAngleThresholdDeg: 105,
    minPointDistance: 3,
  },
  'blender-edit': {
    targetPointCount: 24,
    rings: 3,
    sideLoops: 1,
    inflation: 85,
    bevel: 16,
    innerRingStart: 0.26,
    evenRings: true,
    loopDetail: 'full',
    mergeEpsilon: 0.004,
    simplifyTolerance: 3.5,
    smoothPasses: 1,
    preserveCorners: true,
    cornerAngleThresholdDeg: 98,
    minPointDistance: 3,
  },
  smooth: {
    targetPointCount: 48,
    rings: 4,
    sideLoops: 2,
    inflation: 90,
    bevel: 18,
    innerRingStart: 0.18,
    evenRings: false,
    loopDetail: 'simple',
    mergeEpsilon: 0.008,
    simplifyTolerance: 2,
    smoothPasses: 2,
    preserveCorners: true,
    cornerAngleThresholdDeg: 110,
    minPointDistance: 2,
  },
};

export const DEFAULT_TOPO_PRESET = 'blender-edit';

/** Apply topology preset values to 3D panel settings. */
export function topoPresetD3Patch(presetName, current = {}) {
  const preset = TOPO_PRESETS[presetName] ?? TOPO_PRESETS[DEFAULT_TOPO_PRESET];
  return {
    ...current,
    topoPreset: presetName in TOPO_PRESETS ? presetName : DEFAULT_TOPO_PRESET,
    cseg: preset.targetPointCount,
    bseg: preset.rings,
    inflation: preset.inflation,
    bevel: preset.bevel,
  };
}

/** @param {Partial<import('../core/d3-settings.js').D3Settings>} d3 */
export function resolveTopologySettings(d3 = {}) {
  const preset = TOPO_PRESETS[d3.topoPreset] ?? TOPO_PRESETS[DEFAULT_TOPO_PRESET];
  const targetPointCount = Math.max(
    12,
    Math.min(96, d3.cseg || preset.targetPointCount),
  );
  const rings = Math.max(2, Math.min(6, d3.bseg || preset.rings));
  const inflation = (d3.inflation ?? preset.inflation ?? 75) / 100;

  return {
    preset: d3.topoPreset || DEFAULT_TOPO_PRESET,
    targetPointCount,
    rings,
    inflation,
    bevelNorm: (d3.bevel ?? preset.bevel ?? 16) <= 0
      ? 0
      : Math.max(0.05, Math.min(0.45, (d3.bevel ?? preset.bevel ?? 16) / Math.max(d3.depth || 40, 1))),
    endRound: Math.max(0, Math.min(1, (d3.round ?? 25) / 100)),
    sideLoops: Math.max(1, Math.min(2, preset.sideLoops ?? 1)),
    innerRingStart: preset.innerRingStart ?? 0.24,
    evenRings: preset.evenRings ?? true,
    loopDetail: preset.loopDetail ?? 'simple',
    mergeEpsilon: preset.mergeEpsilon ?? 0.008,
    simplifyTolerance: preset.simplifyTolerance,
    smoothPasses: preset.smoothPasses,
    preserveCorners: preset.preserveCorners,
    cornerAngleThresholdDeg: preset.cornerAngleThresholdDeg,
    minPointDistance: preset.minPointDistance,
  };
}

/** @returns {PrepareOutlineOptions} */
export function toPrepareOptions(topo) {
  return {
    simplifyTolerance: topo.simplifyTolerance,
    smoothPasses: topo.smoothPasses,
    targetPointCount: topo.targetPointCount,
    preserveCorners: topo.preserveCorners,
    cornerAngleThresholdDeg: topo.cornerAngleThresholdDeg,
    minPointDistance: topo.minPointDistance,
  };
}

/** Profiles that use ring-based blob mesh instead of flat extrude. */
export function profileUsesRingBlob(profile) {
  return profile === 'game' || profile === 'inflated' || profile === 'rounded';
}
