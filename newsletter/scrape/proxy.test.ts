import { afterEach, describe, expect, it } from "vitest";
import { isProxyConfigured, proxiedFetch } from "./proxy";

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
