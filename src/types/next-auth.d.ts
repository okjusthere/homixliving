import { DefaultSession } from "next-auth";
import type { AgentAccountStatus } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      agentId: number | null;
      /** Email verified by Google for this login, distinct from the Agent's primary email. */
      loginEmail?: string | null;
      isAdmin: boolean;
      isTeamLeader: boolean;
      accountStatus: AgentAccountStatus;
      /** Derived from accountStatus for legacy access helpers. */
      isActive: boolean;
      limitedCapabilities?: import("@/db/schema").LimitedCapability[];
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    agentId?: number | null;
    /** Set only at a verified Google sign-in; absent on legacy sessions. */
    loginEmail?: string | null;
    isAdmin?: boolean;
    isTeamLeader?: boolean;
    accountStatus?: AgentAccountStatus;
    isActive?: boolean;
    /** epoch ms of the last DB refresh — throttles the jwt callback's upsert. */
    checkedAt?: number;
  }
}
