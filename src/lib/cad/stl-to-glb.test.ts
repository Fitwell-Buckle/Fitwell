import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { stlToGlb, isSpringBar } from "./stl-to-glb";

describe("isSpringBar (spring-bar detection)", () => {
  it("flags true rods (thin in two dims, elongated)", () => {
    expect(isSpringBar([1.8, 5.4, 1.8], false)).toBe(true); // 18mm spring bar
    expect(isSpringBar([1.8, 20, 1.79], false)).toBe(true); // 16mm spring bar
  });

  it("rejects flat prongs/tangs (thin in only one dim)", () => {
    // 16mm M1 prong — elongated (3.1) but NOT rod-like (roundness 2.3).
    expect(isSpringBar([12.59, 1.75, 4.01], false)).toBe(false);
  });

  it("rejects chunky connectors (not elongated)", () => {
    expect(isSpringBar([3.52, 3, 3.25], false)).toBe(false);
  });

  it("never flags the largest component (the body)", () => {
    expect(isSpringBar([1.8, 20, 1.79], true)).toBe(false);
  });
});

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
