import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { AuthSessionProvider } from "@/components/providers/session-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <AuthSessionProvider>
    <div className="flex h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white px-10">
          <div />
          <Suspense>
            <DateRangePicker />
          </Suspense>
        </header>
        <main className="flex-1 overflow-auto bg-[#fafafa] px-10 py-8">
          {children}
        </main>
      </div>
    </div>
    </AuthSessionProvider>
  );
}
