import { describe, it, expect } from "vitest";
import { parseCampaignConfig } from "./campaign-config";

const VALID = `
subject: "Your buckle is ready"
from_email: "hello@fitwellbuckle.co"
from_label: "Fitwell Buckle Co."
audiences:
  included:
    - abc123
`;

describe("parseCampaignConfig", () => {
  it("accepts a minimal valid config", () => {
    const c = parseCampaignConfig(VALID);
    expect(c.subject).toBe("Your buckle is ready");
    expect(c.from_email).toBe("hello@fitwellbuckle.co");
    expect(c.audiences.included).toEqual(["abc123"]);
  });

  it("accepts optional preview_text + reply_to + excluded audiences", () => {
    const c = parseCampaignConfig(`
subject: "x"
preview_text: "see inside"
from_email: "hello@fitwellbuckle.co"
from_label: "Fitwell"
reply_to_email: "reply@fitwellbuckle.co"
audiences:
  included: ["a"]
  excluded: ["b", "c"]
`);
    expect(c.preview_text).toBe("see inside");
    expect(c.reply_to_email).toBe("reply@fitwellbuckle.co");
    expect(c.audiences.excluded).toEqual(["b", "c"]);
  });

  it("rejects missing required fields with a helpful message", () => {
    expect(() =>
      parseCampaignConfig(`
from_email: "hello@fitwellbuckle.co"
from_label: "Fitwell"
audiences:
  included: ["a"]
`),
    ).toThrow(/subject/);
  });

  it("rejects unknown top-level keys (strict mode)", () => {
    expect(() =>
      parseCampaignConfig(`${VALID}\nweird_key: "x"\n`),
    ).toThrow(/weird_key/);
  });

  it("rejects unknown audience keys (strict mode)", () => {
    expect(() =>
      parseCampaignConfig(`
subject: "x"
from_email: "hello@fitwellbuckle.co"
from_label: "Fitwell"
audiences:
  included: ["a"]
  somewhere: ["b"]
`),
    ).toThrow(/somewhere/);
  });

  it("rejects malformed email addresses", () => {
    expect(() =>
      parseCampaignConfig(`
subject: "x"
from_email: "not-an-email"
from_label: "Fitwell"
audiences:
  included: ["a"]
`),
    ).toThrow(/from_email/);
  });

  it("rejects empty included audiences", () => {
    expect(() =>
      parseCampaignConfig(`
subject: "x"
from_email: "hello@fitwellbuckle.co"
from_label: "Fitwell"
audiences:
  included: []
`),
    ).toThrow(/audiences\.included/);
  });

  it("surfaces a clean error for invalid YAML", () => {
    expect(() => parseCampaignConfig("subject: [unclosed")).toThrow(
      /not valid YAML/,
    );
  });
});
