import { describe, it, expect, vi, beforeEach } from "vitest";
import { KlaviyoClient, KlaviyoApiError } from "./client";

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.KLAVIYO_API_KEY = "pk_test_123";
});

describe("KlaviyoClient.request", () => {
  it("sends auth + revision headers and JSON body for POST", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(200, { data: { type: "campaign-values-report", attributes: { results: [] } } }),
    );
    const client = new KlaviyoClient({ fetchFn });
    await client.campaignValuesReport({
      conversionMetricId: "metric_1",
      statistics: ["opens_unique"],
      timeframe: { key: "last_30_days" },
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://a.klaviyo.com/api/campaign-values-reports");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Klaviyo-API-Key pk_test_123");
    expect(init.headers.revision).toBe("2026-04-15");
    expect(JSON.parse(init.body).data.attributes.conversion_metric_id).toBe("metric_1");
  });

  it("retries 429 with Retry-After then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(429, { errors: [] }, { "retry-after": "0" }))
      .mockResolvedValueOnce(
        jsonRes(200, {
          data: { type: "campaign-values-report", attributes: { results: [] } },
        }),
      );
    const client = new KlaviyoClient({ fetchFn });
    await client.campaignValuesReport({
      conversionMetricId: "m1",
      statistics: ["opens_unique"],
      timeframe: { key: "last_30_days" },
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx then surfaces error if it keeps failing", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(503, { errors: [{ detail: "down" }] }, { "retry-after": "0" }),
    );
    const client = new KlaviyoClient({ fetchFn });
    await expect(
      client.campaignValuesReport({
        conversionMetricId: "m1",
        statistics: ["opens_unique"],
        timeframe: { key: "last_30_days" },
      }),
    ).rejects.toBeInstanceOf(KlaviyoApiError);
    // 1 initial + 3 retries
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("throws immediately on 4xx that isn't 429", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(401, { errors: [{ detail: "bad key" }] }),
    );
    const client = new KlaviyoClient({ fetchFn });
    await expect(
      client.campaignValuesReport({
        conversionMetricId: "m1",
        statistics: ["opens_unique"],
        timeframe: { key: "last_30_days" },
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws if KLAVIYO_API_KEY is missing", () => {
    delete process.env.KLAVIYO_API_KEY;
    expect(() => new KlaviyoClient()).toThrow(/KLAVIYO_API_KEY/);
  });
});

describe("KlaviyoClient.campaignValuesReport", () => {
  it("returns the results array from the JSON:API envelope", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(200, {
        data: {
          type: "campaign-values-report",
          attributes: {
            results: [
              {
                groupings: { campaign_id: "c1", send_channel: "email" },
                statistics: { opens_unique: 42, conversion_value: 99.5 },
              },
            ],
          },
        },
      }),
    );
    const client = new KlaviyoClient({ fetchFn });
    const rows = await client.campaignValuesReport({
      conversionMetricId: "m1",
      statistics: ["opens_unique", "conversion_value"],
      timeframe: { key: "last_30_days" },
    });
    expect(rows).toEqual([
      {
        groupings: { campaign_id: "c1", send_channel: "email" },
        statistics: { opens_unique: 42, conversion_value: 99.5 },
      },
    ]);
  });
});

describe("KlaviyoClient.metricAggregate", () => {
  it("zips dates with the first measurement series", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(200, {
        data: {
          type: "metric-aggregate",
          attributes: {
            dates: ["2026-05-01T00:00:00+00:00", "2026-05-02T00:00:00+00:00"],
            data: [{ measurements: { count: [10, 25] } }],
          },
        },
      }),
    );
    const client = new KlaviyoClient({ fetchFn });
    const out = await client.metricAggregate({
      metricId: "subscribed_metric",
      measurements: ["count"],
      interval: "day",
      start: new Date("2026-05-01T00:00:00Z"),
      end: new Date("2026-05-03T00:00:00Z"),
    });
    expect(out).toEqual([
      { date: new Date("2026-05-01T00:00:00Z"), count: 10 },
      { date: new Date("2026-05-02T00:00:00Z"), count: 25 },
    ]);
  });

  it("returns empty array when Klaviyo returns no data", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonRes(200, {
        data: {
          type: "metric-aggregate",
          attributes: { dates: [], data: [] },
        },
      }),
    );
    const client = new KlaviyoClient({ fetchFn });
    const out = await client.metricAggregate({
      metricId: "m",
      measurements: ["count"],
      interval: "day",
      start: new Date(),
      end: new Date(),
    });
    expect(out).toEqual([]);
  });
});
