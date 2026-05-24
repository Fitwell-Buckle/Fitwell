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
    <div className="flex h-screen print:block print:h-auto">
      <div className="print:hidden">
        <AdminSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Suspense>
            <DateRangePicker />
          </Suspense>
        </div>
        <main className="flex-1 overflow-auto bg-[#fafafa] px-10 py-8 print:overflow-visible print:bg-white print:p-0">
          {children}
        </main>
      </div>
    </div>
    </AuthSessionProvider>
  );
}
