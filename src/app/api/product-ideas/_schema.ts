import { z } from "zod";
import { IDEA_STATUSES } from "@/lib/product-ideas";

const score = z.number().int().min(1).max(10).nullish();

export const ideaSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  status: z.enum(IDEA_STATUSES).optional(),
  impact: score,
  confidence: score,
  ease: score,
  notes: z.string().max(5000).nullish(),
  // Raw Fusion share link; the route validates the host + resolves the embed URL.
  fusionUrl: z.string().max(2000).nullish().or(z.literal("")),
});
