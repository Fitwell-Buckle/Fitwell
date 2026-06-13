import { afterEach, describe, expect, it } from "vitest";
import { isProxyConfigured, proxiedFetch, runProxiedExclusive } from "./proxy";

const SAVED = {
  user: process.env.BRIGHTDATA_USERNAME,
  pass: process.env.BRIGHTDATA_PASSWORD,
};

afterEach(() => {
  if (SAVED.user === undefined) delete process.env.BRIGHTDATA_USERNAME;
  else process.env.BRIGHTDATA_USERNAME = SAVED.user;
  if (SAVED.pass === undefined) delete process.env.BRIGHTDATA_PASSWORD;
  else process.env.BRIGHTDATA_PASSWORD = SAVED.pass;
});

describe("isProxyConfigured", () => {
  it("is false when creds are absent", () => {
    delete process.env.BRIGHTDATA_USERNAME;
    delete process.env.BRIGHTDATA_PASSWORD;
    expect(isProxyConfigured()).toBe(false);
  });

  it("is true only when both creds are present", () => {
    process.env.BRIGHTDATA_USERNAME = "u";
    delete process.env.BRIGHTDATA_PASSWORD;
    expect(isProxyConfigured()).toBe(false);
    process.env.BRIGHTDATA_PASSWORD = "p";
    expect(isProxyConfigured()).toBe(true);
  });
});

describe("proxiedFetch", () => {
  it("returns null (never throws) when the proxy isn't configured", async () => {
    delete process.env.BRIGHTDATA_USERNAME;
    delete process.env.BRIGHTDATA_PASSWORD;
    await expect(proxiedFetch("https://example.com")).resolves.toBeNull();
  });
});

describe("runProxiedExclusive", () => {
  it("runs queued tasks one-at-a-time, never overlapping", async () => {
    let active = 0;
    let maxConcurrent = 0;
    const order: number[] = [];
    const task = (id: number) =>
      runProxiedExclusive(async () => {
        active++;
        maxConcurrent = Math.max(maxConcurrent, active);
        await new Promise((r) => setTimeout(r, 5));
        order.push(id);
        active--;
        return id;
      });

    const results = await Promise.all([task(1), task(2), task(3)]);
    expect(maxConcurrent).toBe(1); // serialized — never two in flight
    expect(order).toEqual([1, 2, 3]); // FIFO
    expect(results).toEqual([1, 2, 3]);
  });

  it("keeps the queue alive when a task rejects", async () => {
    const failing = runProxiedExclusive(async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    // A subsequent task still runs (the chain didn't wedge on the rejection).
    await expect(runProxiedExclusive(async () => "ok")).resolves.toBe("ok");
  });
});
