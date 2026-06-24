import "server-only";
import sharp from "sharp";
import { Document, WebIO } from "@gltf-transform/core";
import { KHRMaterialsAnisotropy } from "@gltf-transform/extensions";

// ── Brushed grain texture ────────────────────────────────────────────────
// Visible grain needs an actual normal-map (anisotropy only stretches the
// highlight). We generate a tangent-space brushed normal map procedurally:
// fine random ridges that vary along V (across the grain) and are uniform along
// U (so grooves run along U — i.e. circumferentially, given the cylindrical UVs).
const BRUSH_TEX_HEIGHT = 512; // rows of grain
const BRUSH_GRAIN_AMPLITUDE = 92; // green-channel deviation = groove depth
const BRUSH_TILES_ACROSS = 5; // groove-texture repeats across the brushed region (density, unit-independent)
const BRUSH_NORMAL_SCALE = 0.7; // overall groove strength on the material

const REPEAT_WRAP = 10497; // glTF sampler wrap = REPEAT

async function makeBrushedNormalMap(): Promise<Uint8Array> {
  const W = 8;
  const H = BRUSH_TEX_HEIGHT;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    // Random per-row bitangent tilt (green) = a fine groove of varying depth;
    // red 128 (no cross-grain tilt), blue 255 (surface normal up).
    const g = Math.max(
      0,
      Math.min(255, 128 + Math.round(BRUSH_GRAIN_AMPLITUDE * (Math.random() * 2 - 1))),
    );
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      raw[o] = 128;
      raw[o + 1] = g;
      raw[o + 2] = 255;
    }
  }
  const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}
import {
  BODY_MATERIAL_NAME,
  BODY_BRUSHED_MATERIAL_NAME,
  SPRING_BAR_MATERIAL_NAME,
  SPRING_BAR,
  BRUSHED,
  getFinish,
} from "./finishes";

// IO that preserves the KHR_materials_anisotropy extension on read/write — used
// everywhere we (de)serialize a GLB, so the brushed material survives round-trips.
function anisoIO(): WebIO {
  return new WebIO().registerExtensions([KHRMaterialsAnisotropy]);
}

// Brushed roughness for a finish: the brushed top/sides keep their satin
// roughness for glossy finishes, but go fully matte for the bead-blasted ones
// (where there's no polish to contrast against).
function brushedRoughnessFor(finish: ReturnType<typeof getFinish>): number {
  return finish.group === "matte" ? finish.roughness : BRUSHED.roughness;
}

// Recolor a generated GLB's `body` material to a specific finish, returning new
// GLB bytes. The stored GLB is baked with the default (silver) finish and the
// portal viewer recolors it live per SKU — but that recolor is client-side only,
// so anything we hand off (e.g. Shopify native 3D media) must have the finish
// baked in. The `spring_bar` material is left untouched (always silver).
export async function applyFinishToGlb(
  glb: Uint8Array,
  finishId: string | null,
): Promise<Uint8Array> {
  const finish = getFinish(finishId);
  const io = anisoIO();
  const doc = await io.readBinary(glb);
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getName() === BODY_MATERIAL_NAME) {
      mat
        .setBaseColorFactor([...finish.baseColor, 1])
        .setMetallicFactor(finish.metallic)
        .setRoughnessFactor(finish.roughness);
    } else if (mat.getName() === BODY_BRUSHED_MATERIAL_NAME) {
      // Brushed top/sides: finish colour, but keep the brushed (satin) roughness
      // and the baked anisotropy (left untouched here).
      mat
        .setBaseColorFactor([...finish.baseColor, 1])
        .setMetallicFactor(finish.metallic)
        .setRoughnessFactor(brushedRoughnessFor(finish));
    } else if (mat.getName() === SPRING_BAR_MATERIAL_NAME) {
      // Refresh the spring bar to the current SPRING_BAR too, so its matte/shine
      // tracks config changes on re-push without re-baking the stored model.
      mat
        .setBaseColorFactor([...SPRING_BAR.baseColor, 1])
        .setMetallicFactor(SPRING_BAR.metallic)
        .setRoughnessFactor(SPRING_BAR.roughness);
    }
  }
  return io.writeBinary(doc);
}

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

// Per-face geometric normal + area (area = weight for smooth averaging). The
// cross product's magnitude is twice the triangle area, so we get both at once.
function computeFaceData(
  verts: Float32Array,
  indices: Uint32Array,
): { faceNormal: Float32Array; faceArea: Float32Array } {
  const faceCount = indices.length / 3;
  const faceNormal = new Float32Array(faceCount * 3);
  const faceArea = new Float32Array(faceCount);
  for (let f = 0; f < faceCount; f++) {
    const a = indices[3 * f] * 3,
      b = indices[3 * f + 1] * 3,
      c = indices[3 * f + 2] * 3;
    const ux = verts[b] - verts[a],
      uy = verts[b + 1] - verts[a + 1],
      uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a],
      vy = verts[c + 1] - verts[a + 1],
      vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    faceArea[f] = len / 2;
    const inv = len || 1;
    faceNormal[3 * f] = nx / inv;
    faceNormal[3 * f + 1] = ny / inv;
    faceNormal[3 * f + 2] = nz / inv;
  }
  return { faceNormal, faceArea };
}

// Map each face corner to a coarse (1µm) position key, and index the faces
// incident to each key. Used by the angle-based smoother to find the
// neighbouring faces at a vertex — across hairline weld seams included.
function buildCornerAdjacency(
  verts: Float32Array,
  indices: Uint32Array,
): { incidentByCorner: Map<string, number[]>; cornerKey: string[] } {
  const PQ = 1e3; // 1µm grid
  const faceCount = indices.length / 3;
  const cornerKey = new Array<string>(faceCount * 3);
  const incidentByCorner = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const vi = indices[3 * f + k] * 3;
      const key = `${Math.round(verts[vi] * PQ)},${Math.round(verts[vi + 1] * PQ)},${Math.round(verts[vi + 2] * PQ)}`;
      cornerKey[3 * f + k] = key;
      let arr = incidentByCorner.get(key);
      if (!arr) {
        arr = [];
        incidentByCorner.set(key, arr);
      }
      arr.push(f);
    }
  }
  return { incidentByCorner, cornerKey };
}

// Split the welded mesh into connected components (groups of faces joined
// through shared vertices). The Fusion assembly's solids aren't fused, so each
// physical piece — body, connector, spring bars — comes out separate.
function splitComponents(numVerts: number, indices: Uint32Array): number[][] {
  const parent = new Int32Array(numVerts);
  for (let i = 0; i < numVerts; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const faceCount = indices.length / 3;
  for (let f = 0; f < faceCount; f++) {
    union(indices[3 * f], indices[3 * f + 1]);
    union(indices[3 * f + 1], indices[3 * f + 2]);
  }
  const groups = new Map<number, number[]>();
  for (let f = 0; f < faceCount; f++) {
    const root = find(indices[3 * f]);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(f);
  }
  return [...groups.values()];
}

function partExtents(
  verts: Float32Array,
  indices: Uint32Array,
  faces: number[],
): { ext: number[]; vol: number } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const vi = indices[3 * f + k] * 3;
      for (let a = 0; a < 3; a++) {
        const v = verts[vi + a];
        if (v < min[a]) min[a] = v;
        if (v > max[a]) max[a] = v;
      }
    }
  }
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { ext, vol: ext[0] * ext[1] * ext[2] };
}

// Classify each component as body or spring bar. The largest (by bbox) is the
// body. A spring bar is a true ROD: not the largest, elongated (longest > 2× its
// mid extent) AND with a roughly square/round cross-section (mid ≈ smallest, so
// thin in two dimensions). The roundness gate keeps flat tangs/prongs/blades —
// thin in only one dimension — from being mistaken for rods.
// Is this component a spring bar? A rod: not the body, elongated (longest > 2×
// mid) AND with a near-square/round cross-section (mid ≈ smallest). The
// roundness gate is what keeps flat prongs/tangs (thin in one dim only) out.
export function isSpringBar(ext: number[], isLargest: boolean): boolean {
  if (isLargest) return false;
  const s = [...ext].sort((a, b) => a - b);
  const elong = s[2] / (s[1] || 1e-6); // longest / mid
  const roundness = s[1] / (s[0] || 1e-6); // mid / smallest — a rod ≈ 1
  return elong > 2.0 && roundness < 1.6;
}

// Split faces into the spring bars (silver rods, detected by geometry) and the
// rest ("body"). Brushed-vs-polished within the body is decided per face by the
// source material (OBJ tags), not geometry — so we only need bar vs body here.
function classifyFaces(
  verts: Float32Array,
  indices: Uint32Array,
  components: number[][],
): { bodyFaces: number[]; barFaces: number[] } {
  const parts = components.map((faces) => ({ faces, ...partExtents(verts, indices, faces) }));
  let largest = parts[0];
  for (const p of parts) if (p.vol > largest.vol) largest = p;

  const bodyFaces: number[] = [];
  const barFaces: number[] = [];
  for (const p of parts) {
    const isBar = isSpringBar(p.ext, p === largest);
    (isBar ? barFaces : bodyFaces).push(...p.faces);
  }
  return { bodyFaces, barFaces };
}

// Angle-based ("auto-smooth") normals. Naive smoothing averages face normals
// across *every* shared edge, which rounds off the buckle's sharp 90° edges and
// leaves view-dependent, jagged-looking shading along them. Instead we average
// only across edges whose dihedral angle is below a threshold: gentle fillets
// stay smooth, genuine hard edges stay crisp. Output is non-indexed (one normal
// per face corner) so a single vertex can carry a different normal on each side
// of a hard edge.
//
// Adjacency is keyed by a coarse position grid (1µm) rather than the welded
// index, so two faces meeting at a hairline float seam (common in CAD STL
// exports — the same point written as 1.00004 vs 1.00006) are still recognised
// as sharing the edge and get smoothed together. That seam is itself a frequent
// cause of a hard shading line that reads as "jagged" on one side only.
const SMOOTH_ANGLE_DEG = 40;

function buildSmoothedPrimitive(
  verts: Float32Array,
  indices: Uint32Array,
  faceList: number[],
  faceNormal: Float32Array,
  faceArea: Float32Array,
  incidentByCorner: Map<string, number[]>,
  cornerKey: string[],
  // When set, emit per-corner TANGENTs + UVs for the brushed material. `axis` is
  // the world brush direction (linear "long" grain); `perp` the across-grain
  // horizontal axis; `vScale` the groove density (tiles per across-grain unit).
  brush?: {
    axis: [number, number, number];
    perp: [number, number, number];
    vScale: number;
  },
): {
  positions: Float32Array;
  normals: Float32Array;
  tangents: Float32Array | null;
  uvs: Float32Array | null;
} {
  const cosThreshold = Math.cos((SMOOTH_ANGLE_DEG * Math.PI) / 180);
  const positions = new Float32Array(faceList.length * 9);
  const normals = new Float32Array(faceList.length * 9);
  const tangents = brush ? new Float32Array(faceList.length * 12) : null;
  const uvs = brush ? new Float32Array(faceList.length * 6) : null;
  for (let i = 0; i < faceList.length; i++) {
    const f = faceList[i];
    const fnx = faceNormal[3 * f],
      fny = faceNormal[3 * f + 1],
      fnz = faceNormal[3 * f + 2];
    for (let k = 0; k < 3; k++) {
      const vi = indices[3 * f + k] * 3;
      const o = i * 9 + k * 3;
      positions[o] = verts[vi];
      positions[o + 1] = verts[vi + 1];
      positions[o + 2] = verts[vi + 2];
      // Average the incident faces whose normal is within the smoothing angle
      // of this face (area-weighted). Faces across a hard edge are excluded, so
      // the edge stays crisp.
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const g of incidentByCorner.get(cornerKey[3 * f + k]) ?? [f]) {
        const gx = faceNormal[3 * g],
          gy = faceNormal[3 * g + 1],
          gz = faceNormal[3 * g + 2];
        if (gx * fnx + gy * fny + gz * fnz >= cosThreshold) {
          const w = faceArea[g];
          sx += gx * w;
          sy += gy * w;
          sz += gz * w;
        }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      const nx = sx / l,
        ny = sy / l,
        nz = sz / l;
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
      if (tangents) {
        // Constant world-horizontal tangent (the brush axis) — NOT projected
        // onto each face — so the grain runs the same world direction on every
        // brushed face instead of tilting with the surface. Faces edge-on to the
        // axis get a vanishing bitangent (no grain), which is fine.
        const to = i * 12 + k * 4;
        tangents[to] = brush!.axis[0];
        tangents[to + 1] = brush!.axis[1];
        tangents[to + 2] = brush!.axis[2];
        tangents[to + 3] = 1;

        // UV: U along the grain (texture uniform in U), V across the grain ×
        // density → fine grooves running along `axis`.
        const px = positions[o],
          pz = positions[o + 2];
        const uo = i * 6 + k * 2;
        uvs![uo] = px * brush!.axis[0] + pz * brush!.axis[2];
        uvs![uo + 1] =
          (px * brush!.perp[0] + pz * brush!.perp[2]) * brush!.vScale;
      }
    }
  }
  return { positions, normals, tangents, uvs };
}

// Linear brush direction = the brushed region's longest horizontal axis (world
// X or Z, after lay-flat puts +Y up) — "brushed linear long". Returns the grain
// axis, the across-grain (perp) axis, and the groove density so the grain looks
// the same regardless of the model's units/scale.
function computeBrushAxis(
  verts: Float32Array,
  indices: Uint32Array,
  faces: number[],
): {
  axis: [number, number, number];
  perp: [number, number, number];
  vScale: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const vi = indices[3 * f + k] * 3;
      const x = verts[vi],
        z = verts[vi + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const extX = maxX - minX;
  const extZ = maxZ - minZ;
  const alongX = extX >= extZ;
  const perpExtent = (alongX ? extZ : extX) || 1;
  return {
    axis: alongX ? [1, 0, 0] : [0, 0, 1],
    perp: alongX ? [0, 0, 1] : [1, 0, 0],
    vScale: BRUSH_TILES_ACROSS / perpExtent,
  };
}

// Core conversion. `flat` is a triangle-soup of positions (9 floats per
// triangle); `brushedFlags[i]` marks triangle i as brushed (from the source
// material). Welding keeps triangle order, so the flag indexes the welded faces
// directly. STL input has no materials → no brushed faces; OBJ input carries
// them via `usemtl`.
async function meshToGlb(
  flat: number[],
  brushedFlags: boolean[],
): Promise<ConvertResult> {
  if (flat.length === 0) throw new Error("Mesh contains no geometry.");
  const { verts, indices } = weld(flat);
  layFlat(verts);
  const { faceNormal, faceArea } = computeFaceData(verts, indices);
  const { incidentByCorner, cornerKey } = buildCornerAdjacency(verts, indices);
  const components = splitComponents(verts.length / 3, indices);
  const { bodyFaces, barFaces } = classifyFaces(verts, indices, components);

  // Within the body, brushed vs polished comes straight from the source tags.
  const bodyBrushedFaces = bodyFaces.filter((f) => brushedFlags[f]);
  const bodyPolishedFaces = bodyFaces.filter((f) => !brushedFlags[f]);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh();

  // Add one non-indexed primitive (angle-smoothed per-corner normals) for a set
  // of faces under a material. With `brush`, also emits TANGENTs + UVs for the
  // brushed (linear-grain) material.
  const addPart = (
    faces: number[],
    mat: ReturnType<Document["createMaterial"]>,
    brush?: {
      axis: [number, number, number];
      perp: [number, number, number];
      vScale: number;
    },
  ) => {
    if (faces.length === 0) return;
    const { positions, normals, tangents, uvs } = buildSmoothedPrimitive(
      verts,
      indices,
      faces,
      faceNormal,
      faceArea,
      incidentByCorner,
      cornerKey,
      brush,
    );
    const pos = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(positions as Float32Array<ArrayBuffer>)
      .setBuffer(buffer);
    const nrm = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(normals as Float32Array<ArrayBuffer>)
      .setBuffer(buffer);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", pos)
      .setAttribute("NORMAL", nrm)
      .setMaterial(mat);
    if (tangents) {
      const tan = doc
        .createAccessor()
        .setType("VEC4")
        .setArray(tangents as Float32Array<ArrayBuffer>)
        .setBuffer(buffer);
      prim.setAttribute("TANGENT", tan);
    }
    if (uvs) {
      const uv = doc
        .createAccessor()
        .setType("VEC2")
        .setArray(uvs as Float32Array<ArrayBuffer>)
        .setBuffer(buffer);
      prim.setAttribute("TEXCOORD_0", uv);
    }
    mesh.addPrimitive(prim);
  };

  const body = getFinish(null);

  // Polished body — named so the viewer can recolor it per finish. Baked with
  // the default finish so the stored GLB looks right un-recolored.
  if (bodyPolishedFaces.length > 0) {
    const bodyMat = doc
      .createMaterial(BODY_MATERIAL_NAME)
      .setBaseColorFactor([...body.baseColor, 1])
      .setMetallicFactor(body.metallic)
      .setRoughnessFactor(body.roughness);
    addPart(bodyPolishedFaces, bodyMat);
  }

  // Brushed faces — a linear brushed-metal normal map (visible grooves running
  // along the region's long axis). No anisotropy: its view-dependent stretched
  // highlight sweeps as the model rotates and reads as scattered; the static
  // normal-map grooves give a steady, uniform grain.
  if (bodyBrushedFaces.length > 0) {
    const brushedMat = doc
      .createMaterial(BODY_BRUSHED_MATERIAL_NAME)
      .setBaseColorFactor([...body.baseColor, 1])
      .setMetallicFactor(body.metallic)
      .setRoughnessFactor(brushedRoughnessFor(body));

    const normalTex = doc
      .createTexture("brushed_normal")
      .setImage(await makeBrushedNormalMap())
      .setMimeType("image/png");
    brushedMat.setNormalTexture(normalTex);
    brushedMat.setNormalScale(BRUSH_NORMAL_SCALE);
    const texInfo = brushedMat.getNormalTextureInfo();
    texInfo?.setWrapS(REPEAT_WRAP).setWrapT(REPEAT_WRAP);

    // Base the grain on the WHOLE body's long axis (not the scattered brushed
    // patches) so the strokes all run the same way across every brushed face.
    const brush = computeBrushAxis(verts, indices, bodyFaces);
    addPart(bodyBrushedFaces, brushedMat, brush);
  }

  // Spring bars — always silver, never recolored.
  if (barFaces.length > 0) {
    const barMat = doc
      .createMaterial(SPRING_BAR_MATERIAL_NAME)
      .setBaseColorFactor([...SPRING_BAR.baseColor, 1])
      .setMetallicFactor(SPRING_BAR.metallic)
      .setRoughnessFactor(SPRING_BAR.roughness);
    addPart(barFaces, barMat);
  }

  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);

  const glb = await anisoIO().writeBinary(doc);
  return {
    glb,
    vertexCount: verts.length / 3,
    triangleCount: indices.length / 3,
  };
}

export async function stlToGlb(stl: Uint8Array): Promise<ConvertResult> {
  const flat = parseBinarySTL(stl);
  if (flat.length === 0) throw new Error("STL contains no geometry.");
  // STL has no material info → everything polished.
  return meshToGlb(flat, new Array(flat.length / 9).fill(false));
}

// Parse an OBJ (with `usemtl` groups) into a triangle soup + per-triangle
// brushed flags. A face is "brushed" when its active material name contains
// "brush" (Fusion's "Stainless Steel - Brushed Linear Long" appearance). The
// MTL file isn't needed — only the material NAMES referenced by `usemtl`.
function parseObj(text: string): { flat: number[]; brushedFlags: boolean[] } {
  const vx: number[] = [];
  const flat: number[] = [];
  const brushedFlags: boolean[] = [];
  let brushed = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const p = line.split(/\s+/);
      vx.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith("usemtl ")) {
      brushed = /brush/i.test(line.slice(7));
    } else if (line.startsWith("f ")) {
      const idx = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((t) => {
          const n = parseInt(t.split("/")[0], 10);
          return n > 0 ? n - 1 : vx.length / 3 + n; // 1-based, or negative=relative
        });
      // Fan-triangulate any n-gon into triangles.
      for (let i = 1; i + 1 < idx.length; i++) {
        for (const v of [idx[0], idx[i], idx[i + 1]]) {
          flat.push(vx[v * 3], vx[v * 3 + 1], vx[v * 3 + 2]);
        }
        brushedFlags.push(brushed);
      }
    }
  }
  return { flat, brushedFlags };
}

export async function objToGlb(objText: string): Promise<ConvertResult> {
  const { flat, brushedFlags } = parseObj(objText);
  if (flat.length === 0) throw new Error("OBJ contains no geometry.");
  return meshToGlb(flat, brushedFlags);
}
