import { agents, type Agent } from "@/db/schema";

/** The only agent fields needed by rental/sale participant views and editors. */
export type DealParticipantAgent = Pick<Agent, "id" | "name" | "splitPct" | "licensedCompany">;

// Project at the database boundary rather than spreading a full Agent and
// removing known secrets. Newly added HR, signing, or account fields then stay
// private by default, including in administrator transaction responses.
export const dealParticipantAgentColumns = {
  id: agents.id,
  name: agents.name,
  splitPct: agents.splitPct,
  licensedCompany: agents.licensedCompany,
};
