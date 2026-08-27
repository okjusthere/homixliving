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
  "agent.plan_acknowledgement": points(69, 438, 16, 18),
  "agent.plan_signature": points(112, 483, 174, 24),
  "agent.plan_signed_date": points(95, 521, 191, 22),
  "company.plan_countersignature": points(346, 483, 207, 24),
  "company.plan_countersigned_date": points(330, 521, 223, 22),
  "agent.compensation_plan": points(225, 132, 150, 20),

  "agent.reporting_acknowledgement": points(69, 134, 16, 18),
  "agent.reporting_signature": points(112, 168, 174, 24),
  "agent.reporting_signed_date": points(95, 206, 191, 22),
  "company.reporting_countersignature": points(346, 168, 207, 24),
  "company.reporting_countersigned_date": points(330, 206, 223, 22),

  "agent.ica_address": points(389, 95, 174, 19),
  "agent.ica_effective_date": points(389, 113, 174, 19),
  "agent.ica_signature": points(112, 363, 174, 24),
  "agent.ica_signed_date": points(95, 401, 191, 22),
  "company.ica_countersignature": points(346, 363, 207, 24),
  "company.ica_countersigned_date": points(330, 401, 223, 22),

  "agent.nda_signature": points(112, 438, 174, 24),
  "agent.nda_signed_date": points(95, 476, 191, 22),
  "company.nda_countersignature": points(346, 438, 207, 24),
  "company.nda_countersigned_date": points(330, 476, 223, 22),

  "realty.libor_legal_name": points(211, 293, 133, 23),
  "realty.libor_office_name": points(373, 293, 205, 23),
  "realty.libor_office_address": points(96, 318, 193, 23),
  "realty.libor_office_town": points(285, 318, 161, 23),
  "realty.libor_office_state": points(466, 318, 43, 23),
  "realty.libor_office_zip": points(520, 318, 59, 23),
  "realty.libor_office_phone": points(112, 343, 102, 23),
  "realty.libor_fax": points(263, 343, 93, 23),
  "realty.libor_email": points(389, 343, 190, 23),
  "realty.libor_web_address": points(53, 369, 162, 23),
  "realty.libor_date_of_birth": points(264, 369, 93, 23),
  "realty.libor_preferred_mailing": points(477, 367, 102, 27),
  "realty.libor_residence_address": points(78, 396, 208, 23),
  "realty.libor_residence_town": points(285, 396, 161, 23),
  "realty.libor_residence_state": points(443, 396, 66, 23),
  "realty.libor_residence_zip": points(520, 396, 59, 23),
  "realty.libor_home_phone": points(118, 421, 81, 23),
  "realty.libor_cell_phone": points(272, 421, 105, 23),
  "realty.libor_preferred_phone": points(457, 419, 121, 27),
  "realty.libor_primary_field": points(98, 447, 206, 23),
  "realty.libor_secondary_field": points(381, 447, 198, 23),
  "realty.libor_commercial_activity": points(250, 471, 64, 25),
  "realty.libor_prior_board": points(349, 493, 63, 25),
  "realty.libor_prior_board_name": points(124, 521, 219, 23),
  "realty.libor_nrds_number": points(379, 521, 200, 23),
  "realty.libor_text_consent": points(32, 590, 66, 25),
  "realty.libor_marketing_consent": points(32, 655, 69, 25),
  "realty.libor_application_signature": points(46, 723, 323, 27),
  "realty.libor_application_signed_date": points(365, 723, 193, 27),

  "realty.fees_acknowledgement": points(88, 382, 18, 18),
  "realty.fees_initials": points(154, 405, 113, 24),
  "realty.fees_signature": points(143, 425, 225, 24),
  "realty.fees_signed_date": points(338, 425, 166, 24),
  "company.realty_fees_countersignature": points(187, 445, 184, 24),
  "company.realty_fees_countersigned_date": points(342, 445, 166, 24),

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
  { mergeKey: "licensed_company", page: 1, rect: points(155, 160, 123, 20), label: "Licensed company" },
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
  { mergeKey: "split_pct", page: 1, rect: points(78, 478, 456, 19), label: "Summary: Agent split" },
  { mergeKey: "team_split_pct", page: 1, rect: points(78, 498, 456, 19), label: "Summary: Team split" },
  { mergeKey: "team_sourced_split_pct", page: 1, rect: points(78, 518, 456, 19), label: "Summary: Team-sourced split" },
  { mergeKey: "team_cap_usd", page: 1, rect: points(78, 538, 456, 19), label: "Summary: Team cap" },
  { mergeKey: "team_terms_effective_from", page: 1, rect: points(78, 558, 456, 19), label: "Summary: Team terms effective" },
];

const TEAM_LEADER_MERGE_PLACEMENTS: MergePlacement[] = [
  { mergeKey: "licensed_company", page: 1, rect: points(155, 172, 125, 20), label: "Licensed company" },
  { mergeKey: "agent_name", page: 1, rect: points(155, 190, 143, 19), label: "Team Leader" },
  { mergeKey: "license_number", page: 1, rect: points(389, 190, 166, 19), label: "License number" },
  { mergeKey: "team_name", page: 1, rect: points(155, 204, 143, 19), label: "Team name" },
  { mergeKey: "expected_member_count", page: 1, rect: points(389, 204, 166, 19), label: "Expected members" },
  { mergeKey: "team_positioning", page: 1, rect: points(155, 218, 143, 19), label: "Team positioning" },
  { mergeKey: "compensation_plan", page: 1, rect: points(389, 218, 166, 19), label: "Required plan" },
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
