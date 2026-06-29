import { describe, it, expect, afterEach } from "vitest";
import {
  runAssistantHogQL,
  __setHogQLExecutorForTesting,
} from "./posthog";

afterEach(() => __setHogQLExecutorForTesting(null));

describe("runAssistantHogQL", () => {
  it("keys array-rows by their column names", async () => {
    __setHogQLExecutorForTesting(async () => ({
      columns: ["entry_path", "visitors"],
      results: [
        ["/", 1200],
        ["/pages/m1", 340],
      ],
    }));
    const r = await runAssistantHogQL("SELECT entry_path, count() FROM events");
    expect(r.columns).toEqual(["entry_path", "visitors"]);
    expect(r.rows).toEqual([
      { entry_path: "/", visitors: 1200 },
      { entry_path: "/pages/m1", visitors: 340 },
    ]);
    expect(r.rowCount).toBe(2);
    expect(r.truncated).toBe(false);
  });

  it("flags truncation when results exceed the cap", async () => {
    __setHogQLExecutorForTesting(async () => ({
      columns: ["n"],
      results: Array.from({ length: 5 }, (_, i) => [i]),
    }));
    const r = await runAssistantHogQL("SELECT n FROM events", 3);
    expect(r.rowCount).toBe(3);
    expect(r.truncated).toBe(true);
  });

  it("falls back to col{i} when columns are missing", async () => {
    __setHogQLExecutorForTesting(async () => ({
      columns: [],
      results: [[42]],
    }));
    const r = await runAssistantHogQL("SELECT count() FROM events");
    expect(r.rows).toEqual([{ col0: 42 }]);
  });
});
