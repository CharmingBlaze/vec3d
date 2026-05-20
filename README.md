# Vec3D — Vector to 3D Editor

A modular Vite application for drawing 2D vector artwork and extruding it into interactive 3D meshes.

## Features

- **2D vector tools**: select, node edit, pen/bezier, freehand, shapes, text
- **Layers panel** with reorder and delete
- **SVG import/export**
- **3D extrusion** with depth, bevel, materials (glossy, toon, PBR, wireframe, glass)
- **3D export**: OBJ and GLTF
- **Undo/redo** history

## Dependencies

- **[Three.js](https://threejs.org/)** `^0.172.0` — installed via npm (`dependencies.three`), bundled by Vite
- Addons (e.g. `GLTFExporter`) load from `three/examples/jsm/` through `src/three/setup.js`

After cloning, always run `npm install` so `node_modules/three` is present.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  app/          # init, DOM cache, keyboard
  canvas/       # mouse events, handlers
  core/         # state, constants, context
  editor/       # objects, selection, handles, history
  io/           # SVG import/export, path ops
  svg/          # path math, shapes, coordinates
  three/        # WebGL scene, extrusion, export
  tools/        # pen, pencil, shape drawing
  ui/           # palette, toolbar, layers
  styles/       # global CSS
```

## Workflow

1. Draw or import SVG shapes on the 2D canvas
2. Select objects and click **Generate 3D Mesh**
3. Switch to **3D View** — drag to rotate, scroll to zoom
4. Export as OBJ or GLTF

## Legacy

The original single-file editor is kept as `vec3d_editor.html` for reference.
