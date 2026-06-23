import { z } from "zod";

export const cadModelSchema = z.object({
  name: z.string().min(1).max(200),
  fusionUrl: z.string().url().max(2000).nullish().or(z.literal("")),
});
