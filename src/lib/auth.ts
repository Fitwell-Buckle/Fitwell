import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  user as userTable,
  account as accountTable,
  session as sessionTable,
  verificationToken as verificationTokenTable,
  supplierContact,
  companyContact,
} from "./schema";
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

// Which company (if any) an email may sign in to the B2B portal as.
async function companyIdForEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const row = await db.query.companyContact.findFirst({
    where: eq(companyContact.email, email),
    columns: { companyId: true },
  });
  return row?.companyId ?? null;
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
  // Pass the real schema tables so the adapter selects our custom user columns
  // (role / supplier_id / company_id). Without this, DrizzleAdapter falls back
  // to its built-in default `user` table, those columns are never read, and the
  // session callback always sees role="user" — silently breaking supplier/
  // company role-gating (their portals become unreachable; they're treated as
  // admins).
  adapter: DrizzleAdapter(db, {
    usersTable: userTable,
    accountsTable: accountTable,
    sessionsTable: sessionTable,
    verificationTokensTable: verificationTokenTable,
  }),
  providers: [
    // Request Gmail readonly so the admin's mailbox can be searched for
    // matching contact emails from inside the supplier-contacts UI. Offline
    // access gives us a refresh token; prompt=consent makes existing admins
    // re-grant on next sign-in so the scope actually applies.
    Google({
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    magicLink,
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async signIn({ user, account, email }) {
      // Admins sign in with Google — unchanged, gated by ADMIN_EMAILS.
      if (account?.provider === "google") {
        if (!isAllowedAdmin(user.email, ADMIN_EMAILS)) return false;

        // NextAuth's DrizzleAdapter calls linkAccount only on the FIRST
        // sign-in for a (provider, providerAccountId) tuple. On every
        // subsequent sign-in it just creates a session and never refreshes
        // the stored access_token / refresh_token / scope / expires_at.
        // That means scope changes (e.g. adding gmail.readonly) silently
        // never take effect for already-linked admins — their account row
        // keeps the original sign-in's scopes forever.
        //
        // Force-update the row here with whatever Google just issued. No-op
        // for first-time sign-ins (the row doesn't exist yet — linkAccount
        // runs next).
        if (account.access_token && account.providerAccountId) {
          await db
            .update(accountTable)
            .set({
              access_token: account.access_token,
              refresh_token: account.refresh_token ?? null,
              expires_at: account.expires_at ?? null,
              scope: account.scope ?? null,
              token_type: account.token_type ?? null,
              id_token: account.id_token ?? null,
            })
            .where(
              and(
                eq(accountTable.provider, "google"),
                eq(accountTable.providerAccountId, account.providerAccountId),
              ),
            );
        }
        return true;
      }

      // Suppliers, companies (and, optionally, admins) sign in with the link.
      if (account?.provider === "email") {
        const addr = user.email?.toLowerCase() ?? "";
        const supplierId = await supplierIdForEmail(addr);
        const companyId = supplierId ? null : await companyIdForEmail(addr);
        const adminAllowed = isAllowedAdmin(addr, ADMIN_EMAILS);
        if (!canMagicLinkSignIn(supplierId, companyId, adminAllowed)) {
          return false; // not allowlisted → no link is sent / sign-in is denied
        }

        // Stamp role on the real sign-in step (the link click), not the "send
        // link" step where the user row may not exist yet. Supplier wins if an
        // address is somehow on both allowlists.
        const isLinkClick = !email?.verificationRequest;
        if (isLinkClick && user.id) {
          if (supplierId) {
            await db
              .update(userTable)
              .set({ role: "supplier", supplierId })
              .where(eq(userTable.id, user.id));
          } else if (companyId) {
            await db
              .update(userTable)
              .set({ role: "company", companyId })
              .where(eq(userTable.id, user.id));
          }
        }
        return true;
      }

      return false;
    },
    async session({ session, user }) {
      if (session.user) {
        const u = user as {
          id: string;
          role?: string;
          supplierId?: string | null;
          companyId?: string | null;
        };
        session.user.id = u.id;
        session.user.role = u.role ?? "user";
        session.user.supplierId = u.supplierId ?? null;
        session.user.companyId = u.companyId ?? null;
      }
      return session;
    },
  },
  events: {
    // The signIn callback can't stamp the role on a brand-new contact's FIRST
    // magic-link sign-in: the user row doesn't exist yet at that point (the
    // adapter creates it AFTER signIn returns), so its `user.id` guard skips
    // and the user is created with the default role="user" — which the app
    // treats as admin (full dashboard). The role only self-corrected on a
    // SECOND sign-in. This event fires right after the adapter creates the
    // user (id now exists), so we stamp the supplier/company role here and
    // first-time portal users land correctly instead of in the admin app.
    async createUser({ user }) {
      const addr = user.email?.toLowerCase() ?? "";
      if (!addr || !user.id) return;
      const supplierId = await supplierIdForEmail(addr);
      if (supplierId) {
        await db
          .update(userTable)
          .set({ role: "supplier", supplierId })
          .where(eq(userTable.id, user.id));
        return;
      }
      const companyId = await companyIdForEmail(addr);
      if (companyId) {
        await db
          .update(userTable)
          .set({ role: "company", companyId })
          .where(eq(userTable.id, user.id));
      }
    },
  },
});
