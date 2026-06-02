"use client";

import { LeadForm } from "../lead-form";
import type { CompanyOption } from "@/components/crm/company-picker";

export function NewLeadForm({ companies }: { companies: CompanyOption[] }) {
  return (
    <div className="mt-6">
      <LeadForm companies={companies} />
    </div>
  );
}
