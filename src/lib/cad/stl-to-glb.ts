import "server-only";
import { Document, WebIO } from "@gltf-transform/core";

// Pure-Node STL → GLB conversion for the public 3D viewer. Mirrors the
// scripts/stl-to-glb.py pipeline (weld coincident verts, smooth normals, auto
// lay-flat, polished-steel material) but runs in a serverless function so the
// "Upload Model to Website" flow is fully automated — no Python, browser, or
// email round-trip. CAD files have no color, so we apply a metallic material.

export interface ConvertResult {
  glb: Uint8Array;
  vertexCount: number;
  triangleCount: number;
}

// Binary STL: 80-byte header, uint32 triangle count, then 50 bytes per tri
// (12-float face normal + 3 verts, 2-byte attribute). Fusion exports binary.
function parseBinarySTL(buf: Uint8Array): number[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const triCount = dv.getUint32(80, true);
  const expected = 84 + triCount * 50;
  if (buf.byteLength < expected) {
    throw new Error("Not a valid binary STL (size mismatch).");
  }
  const positions: number[] = [];
  let o = 84;
  for (let i = 0; i < triCount; i++) {
    o += 12; // skip face normal
    for (let v = 0; v < 3; v++) {
      positions.push(
        dv.getFloat32(o, true),
        dv.getFloat32(o + 4, true),
        dv.getFloat32(o + 8, true),
      );
      o += 12;
    }
    o += 2; // attribute byte count
  }
  return positions;
}

// Weld coincident vertices (rounded to 0.1µm) into an indexed mesh so normals
// can be averaged for smooth shading.
function weld(flat: number[]): { verts: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>();
  const verts: number[] = [];
  const indices: number[] = [];
  const q = 1e4;
  for (let i = 0; i < flat.length; i += 3) {
    const x = flat[i],
      y = flat[i + 1],
      z = flat[i + 2];
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = verts.length / 3;
      verts.push(x, y, z);
      map.set(key, idx);
    }
    indices.push(idx);
  }
  return { verts: new Float32Array(verts), indices: new Uint32Array(indices) };
}

// Rotate the smallest-extent axis to +Y so the part lies flat (its broad face
// up) and the turntable spins around its natural vertical — regardless of which
// up-axis the source CAD used.
function layFlat(verts: Float32Array): void {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < verts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = verts[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const s = ext.indexOf(Math.min(...ext));
  if (s === 1) return; // Y already thinnest
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i],
      y = verts[i + 1],
      z = verts[i + 2];
    if (s === 0) {
      // X thinnest → swap into Y
      verts[i] = y;
      verts[i + 1] = x;
      verts[i + 2] = z;
    } else {
      // Z thinnest → -90° about X
      verts[i] = x;
      verts[i + 1] = z;
      verts[i + 2] = -y;
    }
  }
}

function computeSmoothNormals(
  verts: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const n = new Float32Array(verts.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = verts[b] - verts[a],
      uy = verts[b + 1] - verts[a + 1],
      uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a],
      vy = verts[c + 1] - verts[a + 1],
      vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export async function stlToGlb(stl: Uint8Array): Promise<ConvertResult> {
  const flat = parseBinarySTL(stl);
  if (flat.length === 0) throw new Error("STL contains no geometry.");
  const { verts, indices } = weld(flat);
  layFlat(verts);
  const normals = computeSmoothNormals(verts, indices);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(verts as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);
  const nrm = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(normals as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);
  const idx = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(indices as Uint32Array<ArrayBuffer>)
    .setBuffer(buffer);
  const mat = doc
    .createMaterial("steel")
    .setBaseColorFactor([0.62, 0.63, 0.66, 1])
    .setMetallicFactor(1)
    .setRoughnessFactor(0.4);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", pos)
    .setAttribute("NORMAL", nrm)
    .setIndices(idx)
    .setMaterial(mat);
  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);

  const glb = await new WebIO().writeBinary(doc);
  return {
    glb,
    vertexCount: verts.length / 3,
    triangleCount: indices.length / 3,
  };
}
