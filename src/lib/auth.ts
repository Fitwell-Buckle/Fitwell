import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, supplierContact } from "./schema";
import { isAllowedAdmin } from "./admin-access";
import { canMagicLinkSignIn } from "./supplier-access";
import { sendMagicLinkEmail } from "./email/magic-link";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").filter(Boolean);

// Which supplier (if any) an email is authorized to access, via the
// per-supplier allowlist (supplier_contact, stored lowercased).
async function supplierIdForEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const row = await db.query.supplierContact.findFirst({
    where: eq(supplierContact.email, email),
    columns: { supplierId: true },
  });
  return row?.supplierId ?? null;
}

// Custom email magic-link provider. Modeled on @auth/core's Resend provider
// (a plain `type: "email"` object) but delivered through our own helper, which
// falls back to console logging when RESEND_API_KEY is unset (local dev).
const magicLink = {
  id: "email",
  type: "email" as const,
  name: "Email",
  from: process.env.EMAIL_FROM ?? "hello@fitwellbuckle.co",
  maxAge: 60 * 60, // magic links are valid for 1 hour
  async sendVerificationRequest({
    identifier,
    url,
  }: {
    identifier: string;
    url: string;
  }) {
    await sendMagicLinkEmail(identifier, url);
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [Google, magicLink],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async signIn({ user, account, email }) {
      // Admins sign in with Google — unchanged, gated by ADMIN_EMAILS.
      if (account?.provider === "google") {
        return isAllowedAdmin(user.email, ADMIN_EMAILS);
      }

      // Suppliers (and, optionally, admins) sign in with the magic link.
      if (account?.provider === "email") {
        const addr = user.email?.toLowerCase() ?? "";
        const supplierId = await supplierIdForEmail(addr);
        const adminAllowed = isAllowedAdmin(addr, ADMIN_EMAILS);
        if (!canMagicLinkSignIn(supplierId, adminAllowed)) {
          return false; // not allowlisted → no link is sent / sign-in is denied
        }

        // Stamp role + supplier_id on the real sign-in step (the link click),
        // not the "send link" step where the user row may not exist yet.
        const isLinkClick = !email?.verificationRequest;
        if (isLinkClick && supplierId && user.id) {
          await db
            .update(userTable)
            .set({ role: "supplier", supplierId })
            .where(eq(userTable.id, user.id));
        }
        return true;
      }

      return false;
    },
    async session({ session, user }) {
      if (session.user) {
        const u = user as { id: string; role?: string; supplierId?: string | null };
        session.user.id = u.id;
        session.user.role = u.role ?? "user";
        session.user.supplierId = u.supplierId ?? null;
      }
      return session;
    },
  },
});
