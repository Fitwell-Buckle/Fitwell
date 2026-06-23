import { z } from "zod";
import { PROTOTYPE_STATUSES, ROUND_STATUSES } from "@/lib/prototypes";

// ISO date string (YYYY-MM-DD) or empty/null to clear.
const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullish()
  .or(z.literal(""));

export const prototypeSchema = z.object({
  name: z.string().min(1).max(200),
  proposedSku: z.string().max(100).nullish(),
  // When approving, finalSku is required — enforced in the route via
  // approvePrototype(), not here, so partial PATCHes stay flexible.
  finalSku: z.string().max(100).nullish(),
  supplierId: z.string().max(100).nullish(),
  status: z.enum(PROTOTYPE_STATUSES).optional(),
  description: z.string().max(5000).nullish(),
  estUnitCostCents: z.number().int().min(0).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const referenceSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(200).nullish(),
});

export const roundSchema = z.object({
  status: z.enum(ROUND_STATUSES).optional(),
  requestedAt: dateField,
  expectedAt: dateField,
  receivedAt: dateField,
  sampleQty: z.number().int().min(0).nullish(),
  unitCostCents: z.number().int().min(0).nullish(),
  feedback: z.string().max(5000).nullish(),
});
