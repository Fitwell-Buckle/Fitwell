import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const customerFiltersSchema = z.object({
  search: z.string().optional(),
  minSpent: z.coerce.number().int().optional(),
  maxSpent: z.coerce.number().int().optional(),
  utmSource: z.string().optional(),
  tag: z.string().optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type CustomerFilters = z.infer<typeof customerFiltersSchema>;
