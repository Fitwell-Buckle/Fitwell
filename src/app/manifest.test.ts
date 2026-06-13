import { describe, it, expect } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  const m = manifest();

  it("is installable as a standalone app", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
  });

  it("ships a maskable icon plus 192 and 512 'any' icons", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
    // Every icon must point at a real public/ asset path.
    for (const i of icons) expect(i.src.startsWith("/")).toBe(true);
  });
});
