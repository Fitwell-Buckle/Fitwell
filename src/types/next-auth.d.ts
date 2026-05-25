import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    supplierId?: string | null;
    companyId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      supplierId?: string | null;
      companyId?: string | null;
    };
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: string;
    supplierId?: string | null;
    companyId?: string | null;
  }
}
