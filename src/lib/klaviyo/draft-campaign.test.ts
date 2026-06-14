import { describe, it, expect, vi } from "vitest";
import {
  draftCampaign,
  CampaignAlreadySentError,
  isCampaignAlreadySentError,
} from "./draft-campaign";
import type { CampaignConfig } from "./campaign-config";
import type { KlaviyoClient } from "./client";

const CONFIG: CampaignConfig = {
  subject: "Your buckle is ready",
  preview_text: "see inside",
  from_email: "hello@fitwellbuckle.co",
  from_label: "Fitwell Buckle Co.",
  audiences: { included: ["list_abc"], excluded: ["list_xyz"] },
};

function makeClient(overrides: Partial<KlaviyoClient> = {}) {
  return {
    getTemplateByName: vi.fn().mockResolvedValue(null),
    createTemplate: vi.fn().mockResolvedValue({ id: "tpl_new" }),
    updateTemplate: vi.fn().mockResolvedValue({ id: "tpl_existing" }),
    getCampaignByName: vi.fn().mockResolvedValue(null),
    createCampaign: vi.fn().mockResolvedValue({
      id: "camp_new",
      messageId: "msg_new",
    }),
    updateCampaignDraft: vi.fn().mockResolvedValue(undefined),
    assignTemplateToCampaignMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as KlaviyoClient;
}

describe("draftCampaign", () => {
  it("first run: creates template + campaign + assigns template", async () => {
    const client = makeClient();
    const result = await draftCampaign({
      slug: "2026-06-collectors-bundle",
      config: CONFIG,
      html: "<html><body>x</body></html>",
      client,
    });

    expect(client.getTemplateByName).toHaveBeenCalledWith(
      "2026-06-collectors-bundle",
    );
    expect(client.createTemplate).toHaveBeenCalledWith({
      name: "2026-06-collectors-bundle",
      html: "<html><body>x</body></html>",
    });
    expect(client.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "2026-06-collectors-bundle",
        audiencesIncluded: ["list_abc"],
        audiencesExcluded: ["list_xyz"],
        subject: "Your buckle is ready",
        previewText: "see inside",
        fromEmail: "hello@fitwellbuckle.co",
        fromLabel: "Fitwell Buckle Co.",
      }),
    );
    expect(client.assignTemplateToCampaignMessage).toHaveBeenCalledWith({
      campaignMessageId: "msg_new",
      templateId: "tpl_new",
    });
    expect(result.mode).toBe("created");
    expect(result.campaignId).toBe("camp_new");
    expect(result.templateId).toBe("tpl_new");
    expect(result.klaviyoUrl).toContain("camp_new");
  });

  it("second run on existing draft: PATCHes template + campaign, re-assigns", async () => {
    const client = makeClient({
      getTemplateByName: vi
        .fn()
        .mockResolvedValue({ id: "tpl_existing" }),
      getCampaignByName: vi.fn().mockResolvedValue({
        id: "camp_existing",
        status: "Draft",
        messageId: "msg_existing",
      }),
    } as Partial<KlaviyoClient>);

    const result = await draftCampaign({
      slug: "2026-06-collectors-bundle",
      config: CONFIG,
      html: "<html><body>UPDATED</body></html>",
      client,
    });

    expect(client.updateTemplate).toHaveBeenCalledWith({
      id: "tpl_existing",
      name: "2026-06-collectors-bundle",
      html: "<html><body>UPDATED</body></html>",
    });
    expect(client.createTemplate).not.toHaveBeenCalled();
    expect(client.updateCampaignDraft).toHaveBeenCalledWith({
      id: "camp_existing",
      name: "2026-06-collectors-bundle",
      audiencesIncluded: ["list_abc"],
      audiencesExcluded: ["list_xyz"],
    });
    expect(client.createCampaign).not.toHaveBeenCalled();
    expect(client.assignTemplateToCampaignMessage).toHaveBeenCalledWith({
      campaignMessageId: "msg_existing",
      templateId: "tpl_existing",
    });
    expect(result.mode).toBe("updated");
    expect(result.campaignId).toBe("camp_existing");
  });

  it("refuses to overwrite a campaign that has already been sent", async () => {
    const client = makeClient({
      getCampaignByName: vi.fn().mockResolvedValue({
        id: "camp_sent",
        status: "Sent",
        messageId: "msg_sent",
      }),
    } as Partial<KlaviyoClient>);

    await expect(
      draftCampaign({
        slug: "old-campaign",
        config: CONFIG,
        html: "<html></html>",
        client,
      }),
    ).rejects.toBeInstanceOf(CampaignAlreadySentError);

    expect(client.updateCampaignDraft).not.toHaveBeenCalled();
    expect(client.createCampaign).not.toHaveBeenCalled();
    expect(client.assignTemplateToCampaignMessage).not.toHaveBeenCalled();
  });

  it("errors clearly if an existing campaign has no message id", async () => {
    const client = makeClient({
      getCampaignByName: vi.fn().mockResolvedValue({
        id: "camp_broken",
        status: "Draft",
        messageId: null,
      }),
    } as Partial<KlaviyoClient>);

    await expect(
      draftCampaign({
        slug: "broken",
        config: CONFIG,
        html: "<html></html>",
        client,
      }),
    ).rejects.toThrow(/no campaign-message/);
  });
});

describe("isCampaignAlreadySentError", () => {
  it("matches a real CampaignAlreadySentError (instanceof path)", () => {
    expect(
      isCampaignAlreadySentError(new CampaignAlreadySentError("slug", "Sent")),
    ).toBe(true);
  });

  it("matches a structurally-equivalent error from another module instance (name path)", () => {
    // Simulates the cross-module/transpile case where `instanceof` fails but
    // the thrown error is the same kind — the backstop must still no-op.
    const lookalike = new Error("Refusing to overwrite campaign ...");
    lookalike.name = "CampaignAlreadySentError";
    expect(lookalike instanceof CampaignAlreadySentError).toBe(false);
    expect(isCampaignAlreadySentError(lookalike)).toBe(true);
  });

  it("does not match unrelated errors or non-errors", () => {
    expect(isCampaignAlreadySentError(new Error("network down"))).toBe(false);
    expect(isCampaignAlreadySentError({ name: "CampaignAlreadySentError" })).toBe(
      false,
    );
    expect(isCampaignAlreadySentError(null)).toBe(false);
    expect(isCampaignAlreadySentError("CampaignAlreadySentError")).toBe(false);
  });
});
