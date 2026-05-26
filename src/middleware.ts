import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Admin page prefixes (everything that isn't the supplier portal or auth).
const ADMIN_PAGE_PREFIXES = [
  "/dashboard",
  "/customers",
  "/orders",
  "/invoices",
  "/campaigns",
  "/attribution",
  "/funnel",
  "/influencers",
  "/influencer-tracking",
  "/products",
  "/inventory",
  "/modules",
  "/settings",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The portal login pages are public so unauthenticated users can request a
  // magic link.
  if (pathname === "/supplier/login" || pathname.startsWith("/supplier/login/")) {
    return NextResponse.next();
  }
  if (pathname === "/portal/login" || pathname.startsWith("/portal/login/")) {
    return NextResponse.next();
  }

  const isSupplierRoute = pathname.startsWith("/supplier");
  const isPortalRoute = pathname.startsWith("/portal");
  const isAdminPage = ADMIN_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isSupplierRoute && !isPortalRoute && !isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  const session = await auth();
  const role = session?.user?.role;

  // Supplier portal: must be signed in AND have the supplier role.
  if (isSupplierRoute) {
    if (!session?.user) {
      const loginUrl = new URL("/supplier/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (role !== "supplier") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Company B2B portal: must be signed in AND have the company role.
  if (isPortalRoute) {
    if (!session?.user) {
      const loginUrl = new URL("/portal/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (role !== "company") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Admin pages: must be signed in; suppliers + companies go to their portals.
  if (isAdminPage) {
    if (!session?.user) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (role === "supplier") {
      return NextResponse.redirect(new URL("/supplier", req.url));
    }
    if (role === "company") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  // Admin API: must be signed in (and not a portal user).
  if (isAdminApi) {
    if (!session?.user || role === "supplier" || role === "company") {
      return NextResponse.json(
        { error: "Unauthorized", success: false },
        { status: 401 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/orders/:path*",
    "/invoices/:path*",
    "/campaigns/:path*",
    "/attribution/:path*",
    "/funnel/:path*",
    "/influencers/:path*",
    "/influencer-tracking/:path*",
    "/products/:path*",
    "/inventory/:path*",
    "/modules/:path*",
    "/settings/:path*",
    "/supplier/:path*",
    "/portal/:path*",
    "/api/admin/:path*",
  ],
};
