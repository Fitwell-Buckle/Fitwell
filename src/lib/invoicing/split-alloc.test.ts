import { describe, it, expect } from "vitest";
import {
  expandAlloc,
  reconstructAlloc,
  anyOverAllocated,
  editableSum,
  remainderQty,
  type SplitLocation,
  type Alloc,
} from "./split-alloc";

const loc = (id: string): SplitLocation => ({ addressId: id, label: id });

describe("expandAlloc", () => {
  it("non-split (<2 locations): one line per SKU, no address", () => {
    const out = expandAlloc(
      [{ shopifyVariantId: "v1", total: 5 }],
      [loc("a0")],
      {},
    );
    expect(out).toEqual([{ shopifyVariantId: "v1", quantity: 5, addressId: undefined }]);
  });

  it("2 locations: editable col + auto remainder to the last", () => {
    const alloc: Alloc = { v1: { a0: 3 } };
    const out = expandAlloc([{ shopifyVariantId: "v1", total: 5 }], [loc("a0"), loc("a1")], alloc);
    expect(out).toEqual([
      { shopifyVariantId: "v1", quantity: 3, addressId: "a0" },
      { shopifyVariantId: "v1", quantity: 2, addressId: "a1" },
    ]);
  });

  it("3 locations: two editable cols + remainder to the last", () => {
    const alloc: Alloc = { v1: { a0: 2, a1: 1 } };
    const out = expandAlloc(
      [{ shopifyVariantId: "v1", total: 5 }],
      [loc("a0"), loc("a1"), loc("a2")],
      alloc,
    );
    expect(out).toEqual([
      { shopifyVariantId: "v1", quantity: 2, addressId: "a0" },
      { shopifyVariantId: "v1", quantity: 1, addressId: "a1" },
      { shopifyVariantId: "v1", quantity: 2, addressId: "a2" },
    ]);
  });

  it("skips qty-0 editable columns and a 0 remainder", () => {
    // Everything in the default column → one line, no remainder line emitted.
    const out = expandAlloc(
      [{ shopifyVariantId: "v1", total: 4 }],
      [loc("a0"), loc("a1")],
      { v1: { a0: 4 } },
    );
    expect(out).toEqual([{ shopifyVariantId: "v1", quantity: 4, addressId: "a0" }]);
  });

  it("all to the last location → only the remainder line", () => {
    const out = expandAlloc(
      [{ shopifyVariantId: "v1", total: 4 }],
      [loc("a0"), loc("a1")],
      { v1: { a0: 0 } },
    );
    expect(out).toEqual([{ shopifyVariantId: "v1", quantity: 4, addressId: "a1" }]);
  });

  it("handles multiple SKUs independently", () => {
    const out = expandAlloc(
      [
        { shopifyVariantId: "v1", total: 5 },
        { shopifyVariantId: "v2", total: 2 },
      ],
      [loc("a0"), loc("a1")],
      { v1: { a0: 3 }, v2: { a0: 2 } },
    );
    expect(out).toEqual([
      { shopifyVariantId: "v1", quantity: 3, addressId: "a0" },
      { shopifyVariantId: "v1", quantity: 2, addressId: "a1" },
      { shopifyVariantId: "v2", quantity: 2, addressId: "a0" }, // v2 fully at default
    ]);
  });
});

describe("reconstructAlloc", () => {
  it("round-trips an expanded order back into grid state", () => {
    const stored = [
      { shopifyVariantId: "v1", quantity: 3, shipTo: { addressId: "a0" } },
      { shopifyVariantId: "v1", quantity: 2, shipTo: { addressId: "a1" } },
    ];
    const { locationIds, alloc, totalsByVariant } = reconstructAlloc(stored, "a0");
    expect(locationIds).toEqual(["a0", "a1"]);
    expect(totalsByVariant).toEqual({ v1: 5 });
    expect(alloc).toEqual({ v1: { a0: 3, a1: 2 } });

    // And the round-trip re-expands to the same lines.
    const locations = locationIds.map((id) => ({ addressId: id, label: id }));
    expect(expandAlloc([{ shopifyVariantId: "v1", total: 5 }], locations, alloc)).toEqual([
      { shopifyVariantId: "v1", quantity: 3, addressId: "a0" },
      { shopifyVariantId: "v1", quantity: 2, addressId: "a1" },
    ]);
  });

  it("puts the order default column first even when it appears later in the lines", () => {
    const stored = [
      { shopifyVariantId: "v1", quantity: 1, shipTo: { addressId: "a1" } },
      { shopifyVariantId: "v1", quantity: 4, shipTo: { addressId: "a0" } },
    ];
    const { locationIds } = reconstructAlloc(stored, "a0");
    expect(locationIds).toEqual(["a0", "a1"]);
  });

  it("old-model order (one line per SKU, per-line address) reconstructs cleanly", () => {
    const stored = [
      { shopifyVariantId: "v1", quantity: 2, shipTo: { addressId: "a1" } },
      { shopifyVariantId: "v2", quantity: 3, shipTo: { addressId: "a2" } },
    ];
    const { locationIds, alloc, totalsByVariant } = reconstructAlloc(stored, "a0");
    expect(locationIds).toEqual(["a0", "a1", "a2"]);
    expect(totalsByVariant).toEqual({ v1: 2, v2: 3 });
    expect(alloc).toEqual({ v1: { a1: 2 }, v2: { a2: 3 } });
  });

  it("lines with null shipTo fall to the order default column", () => {
    const stored = [{ shopifyVariantId: "v1", quantity: 5, shipTo: null }];
    const { locationIds, alloc } = reconstructAlloc(stored, "a0");
    expect(locationIds).toEqual(["a0"]);
    expect(alloc).toEqual({ v1: { a0: 5 } });
  });
});

describe("over-allocation + helpers", () => {
  const locations = [loc("a0"), loc("a1")];

  it("editableSum sums only non-last columns", () => {
    const alloc: Alloc = { v1: { a0: 3, a1: 99 } }; // a1 is the last col → ignored
    expect(editableSum(alloc, "v1", locations)).toBe(3);
  });

  it("remainderQty never goes negative", () => {
    expect(remainderQty(5, 3)).toBe(2);
    expect(remainderQty(3, 5)).toBe(0);
  });

  it("anyOverAllocated true when an editable column exceeds the total", () => {
    const lines = [{ shopifyVariantId: "v1", total: 4 }];
    expect(anyOverAllocated(lines, locations, { v1: { a0: 5 } })).toBe(true);
    expect(anyOverAllocated(lines, locations, { v1: { a0: 4 } })).toBe(false);
  });

  it("anyOverAllocated false below 2 locations", () => {
    expect(anyOverAllocated([{ shopifyVariantId: "v1", total: 4 }], [loc("a0")], { v1: { a0: 9 } })).toBe(
      false,
    );
  });
});
