"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Destructive-action button with a confirmation modal. Hits `deleteUrl` with
 * the DELETE method; on success either redirects (when `redirectTo` is set) or
 * refreshes the current route.
 *
 * The confirmation copy intentionally calls out that linked Shopify draft
 * orders are NOT auto-revoked — the user has to handle them in Shopify if the
 * deleted transaction had one (e.g. a sent invoice's pay link).
 */
export function DeleteButton({
  entityKind,
  entityLabel,
  deleteUrl,
  redirectTo,
  size = "sm",
  variant = "outline",
  iconOnly = false,
}: {
  /** Human label for the entity *type*, lowercased in copy (e.g. "PO", "invoice"). */
  entityKind: string;
  /** Displayed identifier shown in the confirm dialog (e.g. "PO 12345"). */
  entityLabel: string;
  /** Endpoint that handles the DELETE (e.g. `/api/invoices/abc123`). */
  deleteUrl: string;
  /** Where to navigate after a successful delete. Omit to refresh in place. */
  redirectTo?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "ghost";
  /** Hide the "Delete" word; show only the trash icon (good for table rows). */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(deleteUrl, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Delete failed.");
        setBusy(false);
        return;
      }
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        aria-label={`Delete ${entityLabel}`}
      >
        <Trash2 className="h-4 w-4" />
        {!iconOnly && "Delete"}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Delete this ${entityKind.toLowerCase()}?`}
        description={`This permanently deletes ${entityLabel} and all related records (line items, attachments, stage events, costs, etc.). Linked Shopify draft orders are NOT auto-revoked — handle those in Shopify if needed. This cannot be undone.`}
      >
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Deleting…" : `Delete ${entityKind.toLowerCase()}`}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
