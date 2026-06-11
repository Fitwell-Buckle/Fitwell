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
    method: "GET" | "POST" | "PATCH",
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

  /**
   * GET /api/flows — list all flows in the account (name + status).
   * Paginates. Used by the Phase 3 spike and by future Phase 4 deploys
   * for idempotency lookups by name.
   */
  async listFlows(): Promise<
    Array<{ id: string; name: string; status: string }>
  > {
    const out: Array<{ id: string; name: string; status: string }> = [];
    let path: string | null = "/flows?fields[flow]=name,status";
    while (path) {
      const page = (await this.request("GET", path)) as JsonApiResponse<
        "flow",
        { name: string; status: string }
      > & { links?: { next?: string } };
      const rows = Array.isArray(page.data) ? page.data : [page.data];
      for (const row of rows) {
        if (row.id) {
          out.push({
            id: row.id,
            name: row.attributes.name,
            status: row.attributes.status,
          });
        }
      }
      const next = page.links?.next ?? null;
      path = next ? next.replace(KLAVIYO_BASE_URL, "") : null;
    }
    return out;
  }

  /**
   * GET /api/flows/{id}?additional-fields[flow]=definition — fetches
   * the full flow definition JSON (triggers, actions, conditional
   * splits, etc.). This is the per-Klaviyo-docs recommended way to
   * understand a flow's structure; Phase 4 will use the result to
   * inform what the YAML compiler needs to produce.
   */
  async getFlowDefinition(id: string): Promise<{
    id: string;
    name: string;
    status: string;
    definition: unknown;
    raw: unknown;
  }> {
    const path = `/flows/${encodeURIComponent(id)}?additional-fields[flow]=definition`;
    const json = (await this.request("GET", path)) as JsonApiResponse<
      "flow",
      {
        name: string;
        status: string;
        definition?: unknown;
      }
    >;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!data?.id) throw new Error(`Klaviyo getFlowDefinition: no flow ${id}`);
    return {
      id: data.id,
      name: data.attributes.name,
      status: data.attributes.status,
      definition: data.attributes.definition ?? null,
      raw: json,
    };
  }

  // ─── Write methods (Phase 2: campaigns, Phase 4: flows) ──────────────

  /**
   * GET /api/templates with name-equality filter. Used by the campaign
   * draft script for idempotency — if a template with this name exists
   * we PATCH it instead of creating a duplicate. Returns null if not found.
   */
  async getTemplateByName(name: string): Promise<{ id: string } | null> {
    const safe = name.replace(/'/g, "\\'");
    const path = `/templates?filter=equals(name,'${encodeURIComponent(safe)}')&fields[template]=name`;
    const page = (await this.request("GET", path)) as JsonApiResponse<
      "template",
      { name: string }
    >;
    const rows = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
    const row = rows[0];
    return row?.id ? { id: row.id } : null;
  }

  /** POST /api/templates — creates an editor_type=CODE (raw HTML) template. */
  async createTemplate(opts: {
    name: string;
    html: string;
  }): Promise<{ id: string }> {
    const body = {
      data: {
        type: "template",
        attributes: {
          name: opts.name,
          editor_type: "CODE",
          html: opts.html,
        },
      },
    };
    const json = (await this.request("POST", "/templates", body)) as JsonApiResponse<
      "template",
      { name: string }
    >;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!data?.id) throw new Error("Klaviyo createTemplate returned no id");
    return { id: data.id };
  }

  /** PATCH /api/templates/{id} — updates an existing template's html in place. */
  async updateTemplate(opts: {
    id: string;
    name: string;
    html: string;
  }): Promise<{ id: string }> {
    const body = {
      data: {
        type: "template",
        id: opts.id,
        attributes: {
          name: opts.name,
          // NB: editor_type is only valid on CREATE — Klaviyo 400s if it's
          // sent on a PATCH. A template's editor_type can't change anyway.
          html: opts.html,
        },
      },
    };
    const json = (await this.request(
      "PATCH",
      `/templates/${opts.id}`,
      body,
    )) as JsonApiResponse<"template", { name: string }>;
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    return { id: data?.id ?? opts.id };
  }

  /**
   * GET /api/campaigns by exact name match. Used by the campaign draft
   * script for idempotency. Returns the campaign + its single email
   * message id (campaigns we create here always have exactly one
   * email message). Returns null if not found.
   */
  async getCampaignByName(
    name: string,
  ): Promise<{ id: string; status: string; messageId: string | null } | null> {
    const safe = name.replace(/'/g, "\\'");
    // Klaviyo requires a messages.channel filter on this endpoint, and the
    // `name` field only supports `contains` (not `equals`) — so we filter
    // broadly, then exact-match client-side.
    const path = `/campaigns?filter=and(equals(messages.channel,'email'),contains(name,'${encodeURIComponent(safe)}'))&fields[campaign]=name,status&include=campaign-messages`;
    const page = (await this.request("GET", path)) as JsonApiResponse<
      "campaign",
      { name: string; status: string }
    > & {
      included?: Array<{ type: string; id: string }>;
    };
    const rows = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
    // `contains` can return partial matches (e.g. an older dated slug) —
    // pick the exact name.
    const row = rows.find((r) => r.attributes?.name === name);
    if (!row?.id) return null;
    // Prefer the matched campaign's own message relationship (robust if
    // `contains` returned several campaigns); fall back to the first
    // included message.
    const relMessageId = (
      row as { relationships?: { "campaign-messages"?: { data?: Array<{ id: string }> } } }
    ).relationships?.["campaign-messages"]?.data?.[0]?.id;
    const messageId =
      relMessageId ??
      page.included?.find((r) => r.type === "campaign-message")?.id ??
      null;
    return {
      id: row.id,
      status: row.attributes.status,
      messageId,
    };
  }

  /**
   * POST /api/campaigns — creates a draft email campaign with one inline
   * campaign-message. Default audiences shape: { included: [listId] }.
   * Klaviyo returns the new campaign id + the message id we then assign
   * a template to via assignTemplateToCampaignMessage.
   *
   * Newly-created campaigns default to draft status — they never
   * auto-send. The Phase 2 contract is: Tom reviews in Klaviyo's UI and
   * sends manually.
   */
  async createCampaign(opts: {
    name: string;
    audiencesIncluded: string[];
    audiencesExcluded?: string[];
    subject: string;
    previewText?: string;
    fromEmail: string;
    fromLabel: string;
    replyToEmail?: string;
  }): Promise<{ id: string; messageId: string }> {
    const body = {
      data: {
        type: "campaign",
        attributes: {
          name: opts.name,
          audiences: {
            included: opts.audiencesIncluded,
            ...(opts.audiencesExcluded
              ? { excluded: opts.audiencesExcluded }
              : {}),
          },
          "campaign-messages": {
            data: [
              {
                type: "campaign-message",
                attributes: {
                  definition: {
                    channel: "email",
                    label: opts.name,
                    content: {
                      subject: opts.subject,
                      ...(opts.previewText
                        ? { preview_text: opts.previewText }
                        : {}),
                      from_email: opts.fromEmail,
                      from_label: opts.fromLabel,
                      ...(opts.replyToEmail
                        ? { reply_to_email: opts.replyToEmail }
                        : {}),
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const json = (await this.request(
      "POST",
      "/campaigns",
      body,
    )) as JsonApiResponse<"campaign", { name: string }> & {
      included?: Array<{ type: string; id: string }>;
    };
    const data = Array.isArray(json.data) ? json.data[0] : json.data;
    if (!data?.id) throw new Error("Klaviyo createCampaign returned no id");
    const messageId =
      json.included?.find((r) => r.type === "campaign-message")?.id;
    if (!messageId) {
      // The campaign was created but Klaviyo didn't include the message
      // in the response — fall back to a follow-up lookup.
      const lookup = await this.getCampaignByName(opts.name);
      if (!lookup?.messageId) {
        throw new Error(
          `Klaviyo created campaign ${data.id} but no campaign-message id returned`,
        );
      }
      return { id: data.id, messageId: lookup.messageId };
    }
    return { id: data.id, messageId };
  }

  /**
   * PATCH /api/campaigns/{id} — updates an existing draft campaign's
   * name / audiences / message content in place. Used by the idempotent
   * draft script when a campaign with this name already exists.
   */
  async updateCampaignDraft(opts: {
    id: string;
    name: string;
    audiencesIncluded: string[];
    audiencesExcluded?: string[];
  }): Promise<void> {
    const body = {
      data: {
        type: "campaign",
        id: opts.id,
        attributes: {
          name: opts.name,
          audiences: {
            included: opts.audiencesIncluded,
            ...(opts.audiencesExcluded
              ? { excluded: opts.audiencesExcluded }
              : {}),
          },
        },
      },
    };
    await this.request("PATCH", `/campaigns/${opts.id}`, body);
  }

  /**
   * POST /api/campaign-message-assign-template — binds a template to a
   * campaign-message. Klaviyo clones the template into the message
   * (non-reusable copy), so subsequent template edits don't auto-flow
   * into the campaign — we re-assign on every draft script run.
   */
  async assignTemplateToCampaignMessage(opts: {
    campaignMessageId: string;
    templateId: string;
  }): Promise<void> {
    const body = {
      data: {
        type: "campaign-message",
        id: opts.campaignMessageId,
        relationships: {
          template: {
            data: { type: "template", id: opts.templateId },
          },
        },
      },
    };
    await this.request("POST", "/campaign-message-assign-template", body);
  }

  /**
   * POST /api/campaign-send-jobs — triggers an immediate send of a draft
   * campaign to its audience. This is the ONLY path that actually sends
   * email; everything else stops at draft. Callers must gate it behind an
   * explicit opt-in (the newsletter's --send flag). The send-job id is the
   * campaign id.
   */
  async sendCampaign(campaignId: string): Promise<void> {
    const body = {
      data: { type: "campaign-send-job", id: campaignId },
    };
    await this.request("POST", "/campaign-send-jobs", body);
  }
}
