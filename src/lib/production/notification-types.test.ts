import { describe, it, expect } from "vitest";
import {
  isSupplierNotificationType,
  SUPPLIER_NOTIFICATION_TYPES,
} from "./notification-types";

describe("isSupplierNotificationType", () => {
  it("classifies supplier-bound types", () => {
    expect(isSupplierNotificationType("note_for_supplier")).toBe(true);
    expect(isSupplierNotificationType("document_for_supplier")).toBe(true);
    expect(isSupplierNotificationType("update_for_supplier")).toBe(true);
    expect(isSupplierNotificationType("stage_checkin_for_supplier")).toBe(true);
  });

  it("treats admin-bound types as not supplier-bound", () => {
    expect(isSupplierNotificationType("note_for_admin")).toBe(false);
    expect(isSupplierNotificationType("document_for_admin")).toBe(false);
    expect(isSupplierNotificationType("update_for_admin")).toBe(false);
    expect(isSupplierNotificationType("stage_handoff")).toBe(false);
  });

  it("exposes exactly the supplier-bound types", () => {
    expect([...SUPPLIER_NOTIFICATION_TYPES].sort()).toEqual([
      "document_for_supplier",
      "note_for_supplier",
      "stage_checkin_for_supplier",
      "update_for_supplier",
    ]);
  });
});
