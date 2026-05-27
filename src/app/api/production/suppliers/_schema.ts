import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().max(200).nullish().or(z.literal("")),
  shippingAddress: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
});
