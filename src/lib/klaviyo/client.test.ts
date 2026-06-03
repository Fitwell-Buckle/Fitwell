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

describe("KlaviyoClient write methods", () => {
  function jsonOk(body: unknown) {
    return jsonRes(200, body);
  }

  it("createTemplate posts the expected JSON:API body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonOk({ data: { type: "template", id: "tpl_1" } }));
    const client = new KlaviyoClient({ fetchFn });
    const out = await client.createTemplate({
      name: "2026-06-collectors",
      html: "<html></html>",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://a.klaviyo.com/api/templates");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      data: {
        type: "template",
        attributes: {
          name: "2026-06-collectors",
          editor_type: "CODE",
          html: "<html></html>",
        },
      },
    });
    expect(out).toEqual({ id: "tpl_1" });
  });

  it("createCampaign posts the expected inline campaign-message body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonOk({
        data: { type: "campaign", id: "camp_1", attributes: { name: "x" } },
        included: [{ type: "campaign-message", id: "msg_1" }],
      }),
    );
    const client = new KlaviyoClient({ fetchFn });
    const out = await client.createCampaign({
      name: "test-campaign",
      audiencesIncluded: ["list_a"],
      audiencesExcluded: ["list_b"],
      subject: "Hi",
      previewText: "preview",
      fromEmail: "hello@fitwellbuckle.co",
      fromLabel: "Fitwell",
      replyToEmail: "reply@fitwellbuckle.co",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.data.type).toBe("campaign");
    expect(body.data.attributes.name).toBe("test-campaign");
    expect(body.data.attributes.audiences).toEqual({
      included: ["list_a"],
      excluded: ["list_b"],
    });
    const msg = body.data.attributes["campaign-messages"].data[0];
    expect(msg.type).toBe("campaign-message");
    expect(msg.attributes.definition.channel).toBe("email");
    expect(msg.attributes.definition.content).toEqual({
      subject: "Hi",
      preview_text: "preview",
      from_email: "hello@fitwellbuckle.co",
      from_label: "Fitwell",
      reply_to_email: "reply@fitwellbuckle.co",
    });
    expect(out).toEqual({ id: "camp_1", messageId: "msg_1" });
  });

  it("assignTemplateToCampaignMessage posts to the bind endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonOk({}));
    const client = new KlaviyoClient({ fetchFn });
    await client.assignTemplateToCampaignMessage({
      campaignMessageId: "msg_1",
      templateId: "tpl_1",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://a.klaviyo.com/api/campaign-message-assign-template",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.data.id).toBe("msg_1");
    expect(body.data.relationships.template.data).toEqual({
      type: "template",
      id: "tpl_1",
    });
  });

  it("getCampaignByName extracts the included campaign-message id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonOk({
        data: [
          {
            type: "campaign",
            id: "camp_1",
            attributes: { name: "x", status: "Draft" },
          },
        ],
        included: [{ type: "campaign-message", id: "msg_1" }],
      }),
    );
    const client = new KlaviyoClient({ fetchFn });
    const out = await client.getCampaignByName("x");
    expect(out).toEqual({ id: "camp_1", status: "Draft", messageId: "msg_1" });
  });

  it("getCampaignByName returns null when no campaign matches", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonOk({ data: [] }));
    const client = new KlaviyoClient({ fetchFn });
    expect(await client.getCampaignByName("nope")).toBeNull();
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
