/**
 * Klaviyo API client. Phase 0 of the integration uses read methods only;
 * write methods (campaign drafts, flow deploys) will be added in Phase 2+.
 *
 * Auth: `Authorization: Klaviyo-API-Key <key>`. The `revision` header pins
 * the API contract version — bump deliberately, not silently.
 *
 * Rate limits are aggressive on the report endpoints (1/s burst, 2/min
 * steady, 225/day for campaign/flow-values-reports). The daily cron stays
 * well under that, but `request()` handles 429 with `Retry-After`.
 */

const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2026-04-15";
const MAX_RETRIES = 3;

export type KlaviyoStatistic =
  | "recipients"
  | "delivered"
  | "delivery_rate"
  | "opens"
  | "opens_unique"
  | "open_rate"
  | "clicks"
  | "clicks_unique"
  | "click_rate"
  | "click_to_open_rate"
  | "conversions"
  | "conversion_uniques"
  | "conversion_rate"
  | "conversion_value"
  | "bounced"
  | "bounce_rate"
  | "failed"
  | "failed_rate"
  | "unsubscribes"
  | "unsubscribe_rate"
  | "unsubscribe_uniques"
  | "spam_complaints"
  | "spam_complaint_rate";

export type KlaviyoTimeframe =
  | { key: "last_24_hours" | "last_7_days" | "last_30_days" | "last_90_days" | "last_365_days" | "this_month" | "last_month" | "this_year" | "last_year" | "all_time" }
  | { start: string; end: string };

interface JsonApiObject<T extends string, A> {
  type: T;
  id?: string;
  attributes: A;
}

interface JsonApiResponse<T extends string, A> {
  data: JsonApiObject<T, A> | JsonApiObject<T, A>[];
  links?: { next?: string };
}

export interface CampaignValuesRow {
  groupings: { campaign_id: string; send_channel?: string };
  statistics: Partial<Record<KlaviyoStatistic, number>>;
}

export interface FlowValuesRow {
  groupings: { flow_id: string; send_channel?: string };
  statistics: Partial<Record<KlaviyoStatistic, number>>;
}

export interface KlaviyoListSummary {
  id: string;
  name: string;
  profileCount: number | null;
}

export interface KlaviyoMetricSummary {
  id: string;
  name: string;
  integrationName: string | null;
}

interface RawResource<A> {
  id: string;
  attributes: A;
}

export class KlaviyoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "KlaviyoApiError";
  }
}

export class KlaviyoClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts?: { apiKey?: string; fetchFn?: typeof fetch }) {
    const key = opts?.apiKey ?? process.env.KLAVIYO_API_KEY;
    if (!key) {
      throw new Error(
        "Klaviyo client needs KLAVIYO_API_KEY (env or constructor arg)",
      );
    }
    this.apiKey = key;
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${KLAVIYO_BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Klaviyo-API-Key ${this.apiKey}`,
      revision: KLAVIYO_REVISION,
      Accept: "application/vnd.api+json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/vnd.api+json";

    let attempt = 0;
    while (true) {
      const res = await this.fetchFn(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.ok) return res.json();

      // 429 -> respect Retry-After and try again, up to MAX_RETRIES.
      // 5xx -> exponential backoff, same retry budget.
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        const retryAfter = parseFloat(res.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
        attempt++;
        continue;
      }

      const text = await res.text();
      throw new KlaviyoApiError(
        `Klaviyo ${method} ${path} failed: ${res.status}`,
        res.status,
        text,
      );
    }
  }

  /** GET /api/lists — paginate, return all. */
  async listLists(): Promise<KlaviyoListSummary[]> {
    const out: KlaviyoListSummary[] = [];
    let path: string | null = "/lists?fields[list]=name,profile_count";
    while (path) {
      const page = (await this.request("GET", path)) as JsonApiResponse<
        "list",
        { name: string; profile_count?: number | null }
      > & { links?: { next?: string } };
      const rows = Array.isArray(page.data) ? page.data : [page.data];
      for (const row of rows) {
        out.push({
          id: row.id ?? "",
          name: row.attributes.name,
          profileCount: row.attributes.profile_count ?? null,
        });
      }
      const next = page.links?.next ?? null;
      path = next ? next.replace(KLAVIYO_BASE_URL, "") : null;
    }
    return out;
  }

  /** GET /api/metrics — used to discover the Placed Order / Subscribed metric IDs. */
  async listMetrics(): Promise<KlaviyoMetricSummary[]> {
    const out: KlaviyoMetricSummary[] = [];
    let path: string | null = "/metrics";
    while (path) {
      const page = (await this.request("GET", path)) as JsonApiResponse<
        "metric",
        { name: string; integration?: { name?: string } | null }
      > & { links?: { next?: string } };
      const rows = Array.isArray(page.data) ? page.data : [page.data];
      for (const row of rows) {
        out.push({
          id: row.id ?? "",
          name: row.attributes.name,
          integrationName: row.attributes.integration?.name ?? null,
        });
      }
      const next = page.links?.next ?? null;
      path = next ? next.replace(KLAVIYO_BASE_URL, "") : null;
    }
    return out;
  }

  /** POST /api/campaign-values-reports */
  async campaignValuesReport(opts: {
    conversionMetricId: string;
    statistics: KlaviyoStatistic[];
    timeframe: KlaviyoTimeframe;
  }): Promise<CampaignValuesRow[]> {
    const body = {
      data: {
        type: "campaign-values-report",
        attributes: {
          statistics: opts.statistics,
          timeframe: opts.timeframe,
          conversion_metric_id: opts.conversionMetricId,
        },
      },
    };
    const json = (await this.request(
      "POST",
      "/campaign-values-reports",
      body,
    )) as JsonApiResponse<
      "campaign-values-report",
      { results: CampaignValuesRow[] }
    >;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    return data?.attributes?.results ?? [];
  }

  /** POST /api/flow-values-reports */
  async flowValuesReport(opts: {
    conversionMetricId: string;
    statistics: KlaviyoStatistic[];
    timeframe: KlaviyoTimeframe;
  }): Promise<FlowValuesRow[]> {
    const body = {
      data: {
        type: "flow-values-report",
        attributes: {
          statistics: opts.statistics,
          timeframe: opts.timeframe,
          conversion_metric_id: opts.conversionMetricId,
        },
      },
    };
    const json = (await this.request(
      "POST",
      "/flow-values-reports",
      body,
    )) as JsonApiResponse<"flow-values-report", { results: FlowValuesRow[] }>;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    return data?.attributes?.results ?? [];
  }

  /**
   * GET /api/campaigns?filter=... — used to enrich values-report rows with
   * campaign_name and send_time, which the report endpoint doesn't include.
   */
  async getCampaigns(
    campaignIds: string[],
  ): Promise<Map<string, { name: string; sendTime: Date | null }>> {
    const out = new Map<string, { name: string; sendTime: Date | null }>();
    if (campaignIds.length === 0) return out;
    // Klaviyo's campaigns endpoint requires a messages.channel filter; we
    // page through all email campaigns and only keep the IDs we care about.
    const wanted = new Set(campaignIds);
    let path: string | null =
      "/campaigns?filter=equals(messages.channel,'email')&fields[campaign]=name,send_time";
    while (path) {
      const page = (await this.request("GET", path)) as JsonApiResponse<
        "campaign",
        { name: string; send_time?: string | null }
      > & { links?: { next?: string } };
      const rows = Array.isArray(page.data) ? page.data : [page.data];
      for (const row of rows) {
        if (row.id && wanted.has(row.id)) {
          out.set(row.id, {
            name: row.attributes.name,
            sendTime: row.attributes.send_time
              ? new Date(row.attributes.send_time)
              : null,
          });
        }
      }
      if (out.size === wanted.size) break;
      const next = page.links?.next ?? null;
      path = next ? next.replace(KLAVIYO_BASE_URL, "") : null;
    }
    return out;
  }

  /**
   * POST /api/metric-aggregates — used for daily subscribed/unsubscribed
   * counts to populate klaviyo_list_growth_daily.
   */
  async metricAggregate(opts: {
    metricId: string;
    measurements: Array<"count" | "unique" | "sum_value">;
    interval: "hour" | "day" | "week" | "month";
    start: Date;
    end: Date;
  }): Promise<Array<{ date: Date; count: number }>> {
    const body = {
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: opts.metricId,
          measurements: opts.measurements,
          interval: opts.interval,
          timezone: "UTC",
          filter: [
            `greater-or-equal(datetime,${opts.start.toISOString()})`,
            `less-than(datetime,${opts.end.toISOString()})`,
          ],
        },
      },
    };
    const json = (await this.request(
      "POST",
      "/metric-aggregates",
      body,
    )) as JsonApiResponse<
      "metric-aggregate",
      {
        dates: string[];
        data: Array<{ measurements: { count?: number[] } }>;
      }
    >;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    const dates = data?.attributes?.dates ?? [];
    const counts = data?.attributes?.data?.[0]?.measurements?.count ?? [];
    return dates.map((d, i) => ({ date: new Date(d), count: counts[i] ?? 0 }));
  }

  /** GET /api/flows — name lookup for flow IDs (values-report doesn't include names). */
  async getFlows(
    flowIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (flowIds.length === 0) return out;
    const wanted = new Set(flowIds);
    let path: string | null = "/flows?fields[flow]=name";
    while (path) {
      const page = (await this.request("GET", path)) as JsonApiResponse<
        "flow",
        { name: string }
      > & { links?: { next?: string } };
      const rows = Array.isArray(page.data) ? page.data : [page.data];
      for (const row of rows) {
        if (row.id && wanted.has(row.id)) {
          out.set(row.id, row.attributes.name);
        }
      }
      if (out.size === wanted.size) break;
      const next = page.links?.next ?? null;
      path = next ? next.replace(KLAVIYO_BASE_URL, "") : null;
    }
    return out;
  }
}
