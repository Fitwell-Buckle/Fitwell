import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar, SidebarProvider } from "@/components/layout/admin-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
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
    <SidebarProvider>
    <div className="flex h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense>
          <MobileHeader />
        </Suspense>
        <main className="flex-1 overflow-auto bg-[#fafafa] px-4 py-8 md:px-10">
          {children}
        </main>
      </div>
    </div>
    </SidebarProvider>
    </AuthSessionProvider>
  );
}
