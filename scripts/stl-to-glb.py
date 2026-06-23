#!/usr/bin/env python3
"""Convert an STL (e.g. an Autodesk Fusion mesh export) to a GLB for the public
<model-viewer> 3D preview.

Welds coincident vertices so curved faces shade smoothly, computes vertex
normals, and applies a polished-steel PBR material so it matches the Fusion
render. Output goes to public/models/ by default.

Usage:
    python3 scripts/stl-to-glb.py input.stl public/models/buckle.glb

Requires `trimesh`, `numpy`, `scipy` (e.g. `pip install trimesh numpy scipy`).
"""

import math
import sys

import trimesh
from trimesh.visual.material import PBRMaterial


def convert(src: str, dst: str) -> None:
    mesh = trimesh.load(src, force="mesh")
    # Fusion exports Z-up; glTF/<model-viewer> is Y-up. Rotate -90° about X so
    # the part's thin face lands flat (thickness → vertical) instead of standing
    # on end, and a turntable auto-rotate spins around its natural vertical.
    mesh.apply_transform(
        trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0])
    )
    mesh.merge_vertices()          # weld coincident verts → smooth normals
    _ = mesh.vertex_normals        # force-compute
    mesh.visual = trimesh.visual.TextureVisuals(
        material=PBRMaterial(
            name="steel",
            baseColorFactor=[176, 178, 184, 255],
            metallicFactor=1.0,
            roughnessFactor=0.40,
        )
    )
    mesh.export(dst)
    print(f"wrote {dst}  ({len(mesh.vertices)} verts, {len(mesh.faces)} faces)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 scripts/stl-to-glb.py <input.stl> <output.glb>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
