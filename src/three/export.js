import { THREE } from './setup.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ctx } from '../core/context.js';
import { flushRealtime3D } from './realtime.js';

const BLENDER_EXPORT_SCALE = 0.01;

function safeName(value, fallback) {
  return (value || fallback)
    .toString()
    .trim()
    .replace(/[^a-z0-9_]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    || fallback;
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function colorFromMesh(mesh) {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return mat?.color?.clone?.() || new THREE.Color(mesh.userData.fillColor || '#888888');
}

function prepareGeometryForExport(mesh, color) {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrix);
  geo.applyMatrix4(new THREE.Matrix4().makeScale(
    BLENDER_EXPORT_SCALE,
    BLENDER_EXPORT_SCALE,
    BLENDER_EXPORT_SCALE,
  ));
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  else {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
    geo.getAttribute('normal').applyNormalMatrix(normalMatrix);
    geo.normalizeNormals();
  }
  if (!geo.getAttribute('uv')) addPlanarUvs(geo);
  addVertexColors(geo, color);
  return geo;
}

function addVertexColors(geo, color) {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function addPlanarUvs(geo) {
  const pos = geo.getAttribute('position');
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const w = Math.max(1, box.max.x - box.min.x);
  const h = Math.max(1, box.max.y - box.min.y);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / w;
    uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

async function collectExportMeshes() {
  await flushRealtime3D({ force: true });
  return ctx.meshes3d
    .filter((mesh) => mesh?.isMesh && mesh.geometry?.getAttribute('position'))
    .map((mesh, index) => {
      mesh.updateMatrix();
      const name = safeName(mesh.name || mesh.userData?.sourceName, `vec3d_mesh_${index + 1}`);
      const color = colorFromMesh(mesh);
      return {
        name,
        color,
        geometry: prepareGeometryForExport(mesh, color),
      };
    });
}

function writeMtl(meshes) {
  let mtl = '# Vec3D material export\n';
  meshes.forEach((item, index) => {
    const matName = `mat_${index + 1}_${item.name}`;
    item.materialName = matName;
    mtl += `\nnewmtl ${matName}\n`;
    mtl += `Kd ${item.color.r.toFixed(6)} ${item.color.g.toFixed(6)} ${item.color.b.toFixed(6)}\n`;
    mtl += 'Ka 0.050000 0.050000 0.050000\n';
    mtl += 'Ks 0.180000 0.180000 0.180000\n';
    mtl += 'Ns 80.000000\n';
    mtl += 'd 1.000000\n';
    mtl += 'illum 2\n';
  });
  return mtl;
}

function faceToken(v, vt, vn, offsets) {
  const vi = v + offsets.v;
  const ti = vt === null ? '' : vt + offsets.vt;
  const ni = vn === null ? '' : vn + offsets.vn;
  if (vt === null && vn === null) return `${vi}`;
  if (vt === null) return `${vi}//${ni}`;
  if (vn === null) return `${vi}/${ti}`;
  return `${vi}/${ti}/${ni}`;
}

function writeObj(meshes) {
  let obj = '# Vec3D OBJ export\n';
  obj += `# Export scale: ${BLENDER_EXPORT_SCALE} Blender units per editor pixel.\n`;
  obj += '# Keep vec3d_model.obj and vec3d_model.mtl in the same folder for material colors.\n';
  obj += '# Vertex colors are also included on v lines for Blender-compatible OBJ importers.\n';
  obj += '# Import into Blender with Forward: -Z Forward, Up: Y Up if needed.\n';
  obj += 'mtllib vec3d_model.mtl\n';
  const offsets = { v: 0, vt: 0, vn: 0 };

  meshes.forEach((item) => {
    const geo = item.geometry;
    const pos = geo.getAttribute('position');
    const color = geo.getAttribute('color');
    const uv = geo.getAttribute('uv');
    const normal = geo.getAttribute('normal');

    obj += `\no ${item.name}\n`;
    obj += `g ${item.name}\n`;
    obj += `usemtl ${item.materialName}\n`;

    for (let i = 0; i < pos.count; i++) {
      obj += `v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)} ${color.getX(i).toFixed(6)} ${color.getY(i).toFixed(6)} ${color.getZ(i).toFixed(6)}\n`;
    }
    for (let i = 0; i < uv.count; i++) {
      obj += `vt ${uv.getX(i).toFixed(6)} ${uv.getY(i).toFixed(6)}\n`;
    }
    for (let i = 0; i < normal.count; i++) {
      obj += `vn ${normal.getX(i).toFixed(6)} ${normal.getY(i).toFixed(6)} ${normal.getZ(i).toFixed(6)}\n`;
    }

    const ix = geo.index;
    if (ix) {
      for (let i = 0; i + 2 < ix.count; i += 3) {
        const a = ix.getX(i) + 1;
        const b = ix.getX(i + 1) + 1;
        const c = ix.getX(i + 2) + 1;
        obj += `f ${faceToken(a, a, a, offsets)} ${faceToken(b, b, b, offsets)} ${faceToken(c, c, c, offsets)}\n`;
      }
    } else {
      for (let i = 1; i + 2 <= pos.count; i += 3) {
        obj += `f ${faceToken(i, i, i, offsets)} ${faceToken(i + 1, i + 1, i + 1, offsets)} ${faceToken(i + 2, i + 2, i + 2, offsets)}\n`;
      }
    }

    offsets.v += pos.count;
    offsets.vt += uv.count;
    offsets.vn += normal.count;
  });

  return obj;
}

export async function exportOBJ() {
  const meshes = await collectExportMeshes();
  if (!meshes.length) {
    alert('Generate 3D first!');
    return;
  }

  const mtl = writeMtl(meshes);
  const obj = writeObj(meshes);
  downloadBlob('vec3d_model.mtl', new Blob([mtl], { type: 'text/plain' }));
  downloadBlob('vec3d_model.obj', new Blob([obj], { type: 'text/plain' }));
  meshes.forEach((item) => item.geometry.dispose());
}

function buildExportGroup(meshes) {
  const root = new THREE.Group();
  root.name = 'Vec3D_Model';
  meshes.forEach((item, index) => {
    const mat = new THREE.MeshStandardMaterial({
      name: `mat_${index + 1}_${item.name}`,
      color: item.color,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(item.geometry, mat);
    mesh.name = item.name;
    root.add(mesh);
  });
  return root;
}

export async function exportGLTF() {
  const meshes = await collectExportMeshes();
  if (!meshes.length) {
    alert('Generate 3D first!');
    return;
  }

  const root = buildExportGroup(meshes);
  const exporter = new GLTFExporter();
  exporter.parse(
    root,
    (result) => {
      const isBinary = result instanceof ArrayBuffer;
      const blob = isBinary
        ? new Blob([result], { type: 'model/gltf-binary' })
        : new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
      downloadBlob(isBinary ? 'vec3d_model.glb' : 'vec3d_model.gltf', blob);
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
    },
    (err) => console.error('GLTF export failed:', err),
    {
      binary: true,
      trs: false,
      onlyVisible: true,
      truncateDrawRange: true,
    },
  );
}
