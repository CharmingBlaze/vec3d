/** Extra metadata stored on layers created by 3D primitive draw tools. */
export function primitiveDataForTool(tool) {
  switch (tool) {
    case 'box3d':
      return { primitive3d: 'box' };
    case 'sphere3d':
      return { primitive3d: 'sphere' };
    case 'cylinder3d':
      return { primitive3d: 'cylinder' };
    default:
      return null;
  }
}

export const PRIMITIVE_DRAW_TOOLS = ['box3d', 'sphere3d', 'cylinder3d'];

export function isPrimitiveDrawTool(tool) {
  return PRIMITIVE_DRAW_TOOLS.includes(tool);
}

export function isDragShapeTool(tool) {
  return ['line', 'shape', 'rect', 'ellipse', 'polygon', 'star', ...PRIMITIVE_DRAW_TOOLS].includes(tool);
}
