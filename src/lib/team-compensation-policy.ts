export const TEAM_SPLIT_PRESETS = [10, 15, 20] as const;
export const TEAM_SOURCED_SPLIT_PRESETS = [10, 15, 20, 25, 30] as const;
export const TEAM_CAP_CENTS_PRESETS = [1_000_000, 1_500_000, 2_000_000, 2_500_000] as const;

export function isTeamSplitPreset(value: number) {
  return TEAM_SPLIT_PRESETS.some((preset) => preset === value);
}

export function isTeamSourcedSplitPreset(value: number) {
  return TEAM_SOURCED_SPLIT_PRESETS.some((preset) => preset === value);
}

export function isTeamCapPreset(value: number | null) {
  return value === null || TEAM_CAP_CENTS_PRESETS.some((preset) => preset === value);
}
