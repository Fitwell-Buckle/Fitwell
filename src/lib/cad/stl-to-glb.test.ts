import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stlToGlb } from "./stl-to-glb";

// Build a minimal binary STL with `tris` triangles (a fan of distinct verts).
function makeBinaryStl(tris: { v: number[][] }[]): Uint8Array {
  const buf = new Uint8Array(84 + tris.length * 50);
  const dv = new DataView(buf.buffer);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    o += 12; // face normal (zeros)
    for (const vert of t.v) {
      dv.setFloat32(o, vert[0], true);
      dv.setFloat32(o + 4, vert[1], true);
      dv.setFloat32(o + 8, vert[2], true);
      o += 12;
    }
    o += 2; // attribute byte count
  }
  return buf;
}

describe("stlToGlb", () => {
  it("converts a binary STL to a valid GLB", async () => {
    const stl = makeBinaryStl([
      { v: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
      { v: [[1, 0, 0], [1, 1, 0], [0, 1, 0]] },
    ]);
    const { glb, vertexCount, triangleCount } = await stlToGlb(stl);
    // glTF binary magic "glTF"
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe("glTF");
    expect(triangleCount).toBe(2);
    // 4 unique verts after welding the shared edge (0,1,0)+(1,0,0).
    expect(vertexCount).toBe(4);
  });

  it("throws on a non-STL / size-mismatched buffer", async () => {
    await expect(stlToGlb(new Uint8Array(10))).rejects.toThrow();
  });
});
