"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  SupplierLeadForm,
  type SupplierLeadFormInitial,
} from "../supplier-lead-form";

const LIST_HREF = "/modules/production/supplier-leads";

// Review step for the supplier-card capture flow. Wraps <SupplierLeadForm>
// with a header + "Start over". Unlike the customer-lead confirm there are no
// company-match / dedup banners — supplier leads are a simple capture pipeline.
export function SupplierCaptureConfirm({
  initial,
  confidence,
  onStartOver,
  onSavedNext,
}: {
  initial: SupplierLeadFormInitial;
  confidence?: Record<string, number | undefined>;
  onStartOver: () => void;
  // Called after a successful save — loops back to the camera for the next card.
  onSavedNext: () => void;
}) {
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          Review the extracted fields before saving.
        </p>
        <Button variant="ghost" size="sm" onClick={onStartOver}>
          Start over
        </Button>
      </div>

      <div className="mt-3">
        <SupplierLeadForm
          initial={initial}
          confidence={confidence}
          rapid
          submitLabel="Save & capture another"
          onSuccess={() => {
            toast.success("Saved");
            onSavedNext();
          }}
          secondaryLabel="Save"
          onSecondary={() => {
            toast.success("Supplier lead saved");
            router.push(LIST_HREF);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
