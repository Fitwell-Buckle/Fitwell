import { auth } from "@/lib/auth";

export type CompanyScope = {
  userId: string;
  companyId: string;
  email: string | null;
};

/**
 * The current session as a company-portal scope, or null if the caller isn't a
 * signed-in company user with a linked company_id. Portal pages + the checkout
 * route use this to gate access and scope everything to the buyer's company.
 */
export async function getCompanyScope(): Promise<CompanyScope | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || u.role !== "company" || !u.companyId) return null;
  return { userId: u.id, companyId: u.companyId, email: u.email ?? null };
}
