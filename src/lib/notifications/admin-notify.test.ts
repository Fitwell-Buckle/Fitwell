import { afterEach, describe, expect, it, vi } from "vitest";

const valuesSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: valuesSpy })) },
}));
vi.mock("@/lib/push/send", () => ({ broadcastWebPush: vi.fn() }));

import { createAdminNotification } from "@/lib/notifications/admin-notify";
import { broadcastWebPush } from "@/lib/push/send";

const mockBroadcast = vi.mocked(broadcastWebPush);

afterEach(() => vi.clearAllMocks());

describe("createAdminNotification", () => {
  it("always records the in-app notification row", async () => {
    await createAdminNotification({ type: "stage_handoff", title: "Hi" });
    expect(valuesSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT push supplier-bound notifications to admin devices", async () => {
    await createAdminNotification({
      type: "stage_checkin_for_supplier",
      title: "Confirm on track",
      poId: "po1",
    });
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("pushes admin-bound notifications and deep-links to the PO", async () => {
    await createAdminNotification({
      type: "stage_handoff",
      title: "Handoff",
      body: "moved",
      poId: "po9",
    });
    expect(mockBroadcast).toHaveBeenCalledWith({
      title: "Handoff",
      body: "moved",
      url: "/modules/production/po/po9",
      tag: "po9",
    });
  });

  it("prefers an explicit href for the push deep-link", async () => {
    await createAdminNotification({
      type: "customer_message",
      title: "New message",
      href: "/customers",
      leadId: "lead2",
    });
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/customers", tag: "lead2" }),
    );
  });

  it("falls back to the inbox when there's no entity to link to", async () => {
    await createAdminNotification({ type: "lead_reply", title: "Replied" });
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/notifications" }),
    );
  });
});
