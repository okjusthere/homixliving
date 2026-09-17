import { listingEvents, type StudioListing } from "./listing-source";
import type { OpenHouseEvent } from "./types";
import { officeDefaults, officeListingInput } from "./office-production";
import { inputSchema } from "./validation";
import { contentValidationMessage } from "./form-state";

export type OpenHouseAgent = { id: number; name: string; mlsId: string; photoUrl: string | null; companyReady: boolean };
export type CompanyOpenHouse = {
  key: string; listing: StudioListing; events: OpenHouseEvent[];
  agent: OpenHouseAgent | null; problem: string | null;
};
export type OpenHouseJob = {
  id: string; key: string; status: string; error: string | null;
  generationId: string | null; outputAssetId: string | null;
  address: string; agentName: string;
};

export function companyOpenHouseInput(listing: StudioListing, assetId: string, events: OpenHouseEvent[]) {
  const input = officeListingInput(listing, assetId, { ...officeDefaults, theme: "open_house" }, events);
  input.representationRole = "listing";
  input.listing!.highlightsMode = "image_model";
  // Without a known billing period, omit this cost rather than guess it.
  if (!input.listing!.associationFeeFrequency) input.listing!.associationFee = undefined;
  return input;
}

/** Stable MLS IDs only; never guess identity from a name or email prefix. */
export function matchOpenHouseAgent(listing: StudioListing, agents: OpenHouseAgent[]) {
  const id = listing.listingAgentId?.trim().toLowerCase();
  if (!id) return null;
  const matches = agents.filter((a) => a.mlsId.trim().toLowerCase() === id);
  const unique = [...new Map(matches.map((a) => [a.id, a])).values()];
  return unique.length === 1 ? unique[0] : null;
}
export function openHouseProblem(listing: StudioListing, agent: OpenHouseAgent | null, events: OpenHouseEvent[] = []) {
  if (events.some((e) => { const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return e.start < "06:00" || minutes(e.end) - minutes(e.start) > 8 * 60; })) return "MLS 公展时间异常（凌晨开始或超过 8 小时），请核对并修正 MLS；也可在海报制作中手动设置。";
  if (!agent) return "无法匹配 Listing Agent：请在经纪人资料中关联正确的 MLS 账号。";
  if (!agent.companyReady) return `${agent.name} 缺少有效所属公司，请完善经纪人资料。`;
  if (!agent.photoUrl || agent.photoUrl.endsWith("/agent-placeholder-logo.png")) return `${agent.name} 缺少头像，请先在个人资料上传。`;
  if (!listing.photos[0]?.url) return "房源缺少照片，请补充 MLS 照片或在海报制作中手动上传。";
  return null;
}
export function companyOpenHouseCandidates(listings: StudioListing[], agents: OpenHouseAgent[], now = Date.now()) {
  return [...new Map(listings.map((l) => [l.id, l])).values()].flatMap((listing) => {
    const events = listingEvents(listing, now);
    if (!events.length) return [];
    const agent = matchOpenHouseAgent(listing, agents);
    const input = companyOpenHouseInput(listing, "00000000-0000-4000-8000-000000000001", events);
    const validation = inputSchema.safeParse(input);
    const problem = openHouseProblem(listing, agent, events) || (!validation.success ? contentValidationMessage(validation.error.issues) : null);
    return [{ listing, events, agent, problem }];
  }).sort((a, b) => `${a.events[0].date} ${a.events[0].start}`.localeCompare(`${b.events[0].date} ${b.events[0].start}`));
}
