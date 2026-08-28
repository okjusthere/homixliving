export type AgreementKind = "agent" | "team_leader";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
};

export type MergePlacement = {
  mergeKey: string;
  page: number;
  rect: Rect;
  label: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function points(x: number, top: number, width: number, height: number): Rect {
  return {
    x: x / PAGE_WIDTH,
    y: top / PAGE_HEIGHT,
    width: width / PAGE_WIDTH,
    height: height / PAGE_HEIGHT,
    rotation: 0,
  };
}

const STABLE_FIELD_RECTS: Record<string, Rect> = {
  "agent.plan_acknowledgement": points(69, 339, 16, 18),
  "agent.plan_signature": points(112, 387, 174, 24),
  "agent.plan_signed_date": points(95, 425, 191, 22),
  "company.plan_countersignature": points(346, 387, 207, 24),
  "company.plan_countersigned_date": points(330, 425, 223, 22),
  "agent.compensation_plan": points(225, 132, 150, 20),

  "agent.reporting_acknowledgement": points(69, 134, 16, 18),
  "agent.reporting_signature": points(112, 168, 174, 24),
  "agent.reporting_signed_date": points(95, 206, 191, 22),
  "company.reporting_countersignature": points(346, 168, 207, 24),
  "company.reporting_countersigned_date": points(330, 206, 223, 22),

  "agent.ica_address": points(389, 95, 174, 19),
  "agent.ica_effective_date": points(389, 113, 174, 19),
  "agent.ica_acknowledgement": points(69, 330, 16, 18),
  "agent.ica_signature": points(112, 363, 174, 24),
  "agent.ica_signed_date": points(95, 401, 191, 22),
  "company.ica_countersignature": points(346, 363, 207, 24),
  "company.ica_countersigned_date": points(330, 401, 223, 22),

  "agent.nda_acknowledgement": points(69, 405, 16, 18),
  "agent.nda_signature": points(112, 438, 174, 24),
  "agent.nda_signed_date": points(95, 476, 191, 22),
  "company.nda_countersignature": points(346, 438, 207, 24),
  "company.nda_countersigned_date": points(330, 476, 223, 22),

  "realty.libor_legal_name": points(211, 284, 133, 16),
  "realty.libor_office_name": points(404, 284, 175, 16),
  "realty.libor_office_address": points(98, 309, 188, 16),
  "realty.libor_office_town": points(312, 309, 131, 16),
  "realty.libor_office_state": points(466, 309, 43, 16),
  "realty.libor_office_zip": points(520, 309, 59, 16),
  "realty.libor_office_phone": points(117, 334, 97, 16),
  "realty.libor_fax": points(266, 334, 90, 16),
  "realty.libor_email": points(427, 334, 152, 16),
  "realty.libor_web_address": points(92, 360, 123, 16),
  "realty.libor_date_of_birth": points(268, 360, 89, 16),
  "realty.libor_preferred_mailing": points(477, 358, 102, 18),
  "realty.libor_residence_address": points(116, 387, 170, 16),
  "realty.libor_residence_town": points(312, 387, 131, 16),
  "realty.libor_residence_state": points(468, 387, 41, 16),
  "realty.libor_residence_zip": points(520, 387, 59, 16),
  "realty.libor_home_phone": points(117, 412, 82, 16),
  "realty.libor_cell_phone": points(275, 412, 102, 16),
  "realty.libor_preferred_phone": points(461, 410, 117, 18),
  "realty.libor_primary_field": points(153, 438, 151, 16),
  "realty.libor_secondary_field": points(425, 438, 154, 16),
  "realty.libor_commercial_activity": points(330, 474, 75, 18),
  "realty.libor_prior_board": points(420, 496, 75, 18),
  "realty.libor_prior_board_name": points(153, 512, 190, 16),
  "realty.libor_nrds_number": points(386, 512, 193, 16),
  "realty.libor_text_consent": points(97, 581, 45, 18),
  "realty.libor_marketing_consent": points(97, 646, 45, 18),
  "realty.libor_application_signature": points(50, 714, 319, 20),
  "realty.libor_application_signed_date": points(397, 714, 161, 20),

  "realty.fees_acknowledgement": points(77, 407, 18, 18),
  "realty.fees_initials": points(154, 426, 113, 20),
  "realty.fees_signature": points(143, 449, 185, 20),
  "realty.fees_signed_date": points(338, 449, 166, 20),
  "company.realty_fees_countersignature": points(187, 470, 150, 20),
  "company.realty_fees_countersigned_date": points(342, 470, 166, 20),

  "team.config_acknowledgement": points(69, 414, 16, 18),
  "team.config_initials": points(154, 437, 94, 25),
  "team.compensation_plan": points(271, 95, 139, 20),
  "team.execution_acknowledgement": points(69, 152, 16, 18),
  "team.leader_signature": points(112, 239, 174, 24),
  "team.leader_signed_date": points(95, 277, 191, 22),
  "company.team_leader_countersignature": points(346, 239, 207, 24),
  "company.team_leader_countersigned_date": points(330, 277, 223, 22),
};

const AGENT_MERGE_PLACEMENTS: MergePlacement[] = [
  { mergeKey: "agent_name", page: 1, rect: points(155, 179, 143, 18), label: "Agent name" },
  { mergeKey: "agent_id", page: 1, rect: points(389, 179, 166, 18), label: "Agent ID" },
  { mergeKey: "agent_email", page: 1, rect: points(155, 197, 143, 18), label: "Agent email" },
  { mergeKey: "agent_phone", page: 1, rect: points(389, 197, 166, 18), label: "Agent phone" },
  { mergeKey: "license_number", page: 1, rect: points(155, 215, 143, 18), label: "License number" },
  { mergeKey: "practice", page: 1, rect: points(389, 215, 166, 18), label: "Practice" },
  { mergeKey: "compensation_plan", page: 1, rect: points(155, 229, 143, 18), label: "Compensation plan" },
  { mergeKey: "affiliation_term_months", page: 1, rect: points(389, 229, 166, 18), label: "Affiliation term" },
  { mergeKey: "sponsor_name", page: 1, rect: points(155, 243, 143, 18), label: "Sponsor" },
  { mergeKey: "team_name", page: 1, rect: points(389, 243, 166, 18), label: "Team" },
  { mergeKey: "agent_name", page: 4, rect: points(155, 95, 143, 19), label: "Agent name" },
  { mergeKey: "license_number", page: 4, rect: points(155, 113, 143, 19), label: "License number" },
  { mergeKey: "licensed_company", page: 1, rect: points(78, 458, 456, 19), label: "Summary: Licensed company" },
  { mergeKey: "split_pct", page: 1, rect: points(78, 478, 456, 19), label: "Summary: Agent split" },
  { mergeKey: "team_split_pct", page: 1, rect: points(78, 498, 456, 19), label: "Summary: Team split" },
  { mergeKey: "team_sourced_split_pct", page: 1, rect: points(78, 518, 456, 19), label: "Summary: Team-sourced split" },
  { mergeKey: "team_cap_usd", page: 1, rect: points(78, 538, 456, 19), label: "Summary: Team cap" },
  { mergeKey: "team_terms_effective_from", page: 1, rect: points(78, 558, 456, 19), label: "Summary: Team terms effective" },
  { mergeKey: "libor_membership_status", page: 1, rect: points(78, 578, 456, 19), label: "Summary: LIBOR status" },
];

const TEAM_LEADER_MERGE_PLACEMENTS: MergePlacement[] = [
  { mergeKey: "agent_name", page: 1, rect: points(155, 190, 143, 19), label: "Team Leader" },
  { mergeKey: "license_number", page: 1, rect: points(389, 190, 166, 19), label: "License number" },
  { mergeKey: "team_name", page: 1, rect: points(155, 204, 143, 19), label: "Team name" },
  { mergeKey: "expected_member_count", page: 1, rect: points(389, 204, 166, 19), label: "Expected members" },
  { mergeKey: "team_positioning", page: 1, rect: points(155, 218, 143, 19), label: "Team positioning" },
  { mergeKey: "compensation_plan", page: 1, rect: points(389, 218, 166, 19), label: "Required plan" },
  { mergeKey: "licensed_company", page: 1, rect: points(78, 498, 456, 19), label: "Summary: Licensed company" },
  { mergeKey: "agent_id", page: 1, rect: points(78, 518, 456, 19), label: "Summary: Portal agent ID" },
  { mergeKey: "agent_email", page: 1, rect: points(78, 538, 456, 19), label: "Summary: Agent email" },
  { mergeKey: "agent_phone", page: 1, rect: points(78, 558, 456, 19), label: "Summary: Agent phone" },
  { mergeKey: "team_name", page: 2, rect: points(155, 111, 143, 19), label: "Team name" },
  { mergeKey: "team_terms_effective_from", page: 2, rect: points(389, 111, 166, 19), label: "Terms effective" },
  { mergeKey: "team_split_pct", page: 2, rect: points(155, 128, 143, 19), label: "Standard Team Split" },
  { mergeKey: "team_sourced_split_pct", page: 2, rect: points(389, 124, 166, 19), label: "Team-sourced split" },
  { mergeKey: "team_cap_usd", page: 2, rect: points(155, 153, 143, 19), label: "Annual Team Cap" },
  { mergeKey: "team_config_version", page: 2, rect: points(389, 153, 166, 19), label: "Configuration version" },
  { mergeKey: "agent_name", page: 7, rect: points(155, 192, 143, 19), label: "Team Leader" },
  { mergeKey: "license_number", page: 7, rect: points(389, 192, 166, 19), label: "License number" },
  { mergeKey: "team_name", page: 7, rect: points(155, 206, 143, 19), label: "Team name" },
  { mergeKey: "team_config_version", page: 7, rect: points(389, 206, 166, 19), label: "Configuration version" },
];

export function stableFieldRect(fieldKey: string): Rect {
  const placement = STABLE_FIELD_RECTS[fieldKey];
  if (!placement) throw new Error(`No approved eSign rectangle exists for ${fieldKey}.`);
  return placement;
}

export function mergePlacements(agreement: AgreementKind): readonly MergePlacement[] {
  return agreement === "team_leader"
    ? TEAM_LEADER_MERGE_PLACEMENTS
    : AGENT_MERGE_PLACEMENTS;
}

export function assertValidGeometry(
  fields: ReadonlyArray<{ page: number; rect: Rect; label: string }>,
) {
  for (const field of fields) {
    const { x, y, width, height } = field.rect;
    if (
      field.page < 1 ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1 ||
      y + height > 1
    ) {
      throw new Error(`eSign field ${field.label} has an invalid page rectangle.`);
    }
  }
}
