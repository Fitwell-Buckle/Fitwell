"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShippingCostUploadModal } from "./shipping-cost-upload-modal";

/** Anytime "Upload shipping costs" trigger — e.g. on the COGS/margin page. */
export function ShippingCostUploadButton({
  lastImportedAt,
}: {
  lastImportedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Upload shipping costs
      </Button>
      <ShippingCostUploadModal
        open={open}
        onOpenChange={setOpen}
        lastImportedAt={lastImportedAt}
      />
    </>
  );
}
