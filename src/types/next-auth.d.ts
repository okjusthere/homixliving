import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      agentId: number | null;
      isAdmin: boolean;
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    agentId?: number | null;
    isAdmin?: boolean;
    isActive?: boolean;
  }
}
