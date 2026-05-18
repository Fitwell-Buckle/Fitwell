import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// The homepage is the auth gate: signed-out visitors go to the login screen,
// signed-in admins go straight to the dashboard. There is no public landing.
export default async function HomePage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/auth/login");
}
