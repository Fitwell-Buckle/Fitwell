import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect admin routes
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/campaigns") ||
    pathname.startsWith("/attribution") ||
    pathname.startsWith("/funnel") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/modules") ||
    pathname.startsWith("/settings")
  ) {
    const session = await auth();
    if (!session?.user) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect admin API routes
  if (pathname.startsWith("/api/admin")) {
    const session = await auth();
    if (!session?.user) {
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
    "/modules/:path*",
    "/settings/:path*",
    "/api/admin/:path*",
  ],
};
