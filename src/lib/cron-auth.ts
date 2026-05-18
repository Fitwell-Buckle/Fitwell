import { NextRequest } from "next/server";
import { auth } from "./auth";

export async function verifyCronOrAdmin(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  const session = await auth();
  return !!session?.user;
}
