import { query, ContentError } from "./store";
import { fetchPublicProfile } from "@/lib/homixweb";
import type { BrandContext } from "./types";

export async function loadBrand(agentId: number): Promise<BrandContext> {
  const [agent] = await query<{
    id: number;
    name: string;
    email: string;
    phone: string | null;
    license_number: string | null;
    licensed_company_id: string;
    company_name: string;
  }>(
    `SELECT a.id,a.name,a.email,a.phone,a.license_number,a.licensed_company_id,c.legal_name AS company_name FROM portal.agents a JOIN portal.licensed_companies c ON c.id=a.licensed_company_id WHERE a.id=$1 AND a.account_status='active' AND c.is_active`,
    [agentId],
  );
  if (!agent)
    throw new ContentError(
      "Complete your active Agent profile and brokerage first / 请先完善经纪人及所属公司资料",
      409,
      "PROFILE_REQUIRED",
    );
  const profile = await fetchPublicProfile(agentId);
  if (profile.unreachable)
    throw new ContentError(
      "Unable to load your saved profile / 暂时无法读取个人资料",
      503,
      "PROFILE_UNAVAILABLE",
    );
  const p = profile.profile;
  return {
    agentId,
    name: p?.name || agent.name,
    email: agent.email,
    phone: agent.phone || p?.phone || "",
    title: p?.title || "",
    licenseNumber: agent.license_number || p?.license_number || "",
    companyId: agent.licensed_company_id,
    companyName: agent.company_name,
    photoUrl:
      p?.photo_url && !p.photo_url.endsWith("/agent-placeholder-logo.png")
        ? p.photo_url
        : null,
  };
}
