"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SupplierLeadForm,
  type SupplierLeadFormInitial,
} from "../supplier-lead-form";

const LIST_HREF = "/modules/production/supplier-leads";

export interface SupplierLeadDetailData extends SupplierLeadFormInitial {
  id: string;
  status: string;
  supplierId: string | null;
}

export function SupplierLeadDetail({ lead }: { lead: SupplierLeadDetailData }) {
  const router = useRouter();
  const [promoting, setPromoting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const converted = lead.status === "converted" || Boolean(lead.supplierId);

  async function promote() {
    setPromoting(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier-leads/${lead.id}/promote`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? `Promote failed (${res.status})`);
        setPromoting(false);
        return;
      }
      toast.success("Supplier created");
      router.push(`/modules/production/suppliers/${body.data.supplierId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
      setPromoting(false);
    }
  }

  async function drop() {
    if (!confirm("Drop this supplier lead? It will be hidden from the list.")) {
      return;
    }
    setDropping(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier-leads/${lead.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `Drop failed (${res.status})`);
        setDropping(false);
        return;
      }
      toast.success("Supplier lead dropped");
      router.push(LIST_HREF);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drop failed");
      setDropping(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              {converted ? (
                <p className="text-violet-700">
                  Converted to a supplier.{" "}
                  {lead.supplierId && (
                    <Link
                      href={`/modules/production/suppliers/${lead.supplierId}`}
                      className="underline decoration-violet-400"
                    >
                      View supplier
                    </Link>
                  )}
                </p>
              ) : (
                <p className="text-zinc-600">
                  A potential new supplier. Promote to create a real supplier
                  record.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {!converted && (
                <Button size="sm" onClick={promote} disabled={promoting}>
                  {promoting ? "Creating…" : "Create supplier"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={drop}
                disabled={dropping}
              >
                {dropping ? "Dropping…" : "Drop"}
              </Button>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <SupplierLeadForm
        leadId={lead.id}
        initial={lead}
        submitLabel="Save changes"
        onSuccess={() => {
          toast.success("Saved");
          router.refresh();
        }}
      />
    </div>
  );
}
