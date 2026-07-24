import { DefaultSession } from "next-auth";
import type { AgentAccountStatus } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      agentId: number | null;
      isAdmin: boolean;
      accountStatus: AgentAccountStatus;
      /** Derived from accountStatus for legacy access helpers. */
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    agentId?: number | null;
    isAdmin?: boolean;
    accountStatus?: AgentAccountStatus;
    isActive?: boolean;
    /** epoch ms of the last DB refresh — throttles the jwt callback's upsert. */
    checkedAt?: number;
  }
}
