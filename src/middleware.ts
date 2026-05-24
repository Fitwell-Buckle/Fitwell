import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Admin page prefixes (everything that isn't the supplier portal or auth).
const ADMIN_PAGE_PREFIXES = [
  "/dashboard",
  "/customers",
  "/orders",
  "/campaigns",
  "/attribution",
  "/funnel",
  "/products",
  "/inventory",
  "/modules",
  "/settings",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The supplier login page is public so unauthenticated suppliers can request
  // a magic link.
  if (pathname === "/supplier/login" || pathname.startsWith("/supplier/login/")) {
    return NextResponse.next();
  }

  const isSupplierRoute = pathname.startsWith("/supplier");
  const isAdminPage = ADMIN_PAGE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isSupplierRoute && !isAdminPage && !isAdminApi) {
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
      // A signed-in admin landing on the portal goes back to the dashboard.
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Admin pages: must be signed in; suppliers are bounced to their portal.
  if (isAdminPage) {
    if (!session?.user) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (role === "supplier") {
      return NextResponse.redirect(new URL("/supplier", req.url));
    }
  }

  // Admin API: must be signed in (and not a supplier).
  if (isAdminApi) {
    if (!session?.user || role === "supplier") {
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
    "/campaigns/:path*",
    "/attribution/:path*",
    "/funnel/:path*",
    "/products/:path*",
    "/inventory/:path*",
    "/modules/:path*",
    "/settings/:path*",
    "/supplier/:path*",
    "/api/admin/:path*",
  ],
};
