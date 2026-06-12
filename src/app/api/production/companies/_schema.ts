import { z } from "zod";

export const companySchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().max(200).nullish().or(z.literal("")),
  address: z.string().max(2000).nullish(),
  customerId: z.string().max(200).nullish(),
  priceTierId: z.string().max(200).nullish(),
  // Catalog restriction (empty = whole catalog): Shopify collection + product ids.
  assignedCollectionIds: z.array(z.string().max(200)).nullish(),
  assignedProductIds: z.array(z.string().max(200)).nullish(),
  // Upfront deposit as a % of order value (0 = pay in full).
  depositPercent: z.number().min(0).max(100).nullish(),
  // Allow "pay later by bank wire" at portal checkout (vs. forced card checkout).
  allowWirePayment: z.boolean().nullish(),
  notes: z.string().max(5000).nullish(),
});
