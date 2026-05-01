// Renewal pipeline helpers — find deals with leases ending soon.
import type { Deal } from "@/db/schema";

export type RenewalWindow = "30" | "60" | "90" | "overdue";

export const RENEWAL_WINDOWS: RenewalWindow[] = ["overdue", "30", "60", "90"];

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export function renewalWindow(daysOut: number | null): RenewalWindow | null {
  if (daysOut === null) return null;
  if (daysOut < 0) return "overdue";
  if (daysOut <= 30) return "30";
  if (daysOut <= 60) return "60";
  if (daysOut <= 90) return "90";
  return null;
}

export function windowLabel(w: RenewalWindow): string {
  switch (w) {
    case "overdue":
      return "Past lease end";
    case "30":
      return "Within 30 days";
    case "60":
      return "30–60 days";
    case "90":
      return "60–90 days";
  }
}

export function windowTone(
  w: RenewalWindow
): "neutral" | "failed" | "draft" {
  switch (w) {
    case "overdue":
      return "failed";
    case "30":
      return "failed";
    case "60":
      return "draft";
    case "90":
      return "neutral";
  }
}

export function isUpcoming(deal: Deal): boolean {
  if (deal.status !== "active") return false;
  if (!deal.leaseEndDate) return false;
  if (deal.renewalStatus === "renewed" || deal.renewalStatus === "lost") return false;
  const days = daysUntil(deal.leaseEndDate);
  if (days === null) return false;
  return days <= 90;
}

export function renewalStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "renewing":
      return "Renewing";
    case "moving_out":
      return "Moving out";
    case "renewed":
      return "Renewed";
    case "lost":
      return "Lost";
    default:
      return "Pending";
  }
}

export function renewalStatusTone(
  status: string | null | undefined
): "neutral" | "sent" | "draft" | "failed" | "accent" {
  switch (status) {
    case "renewing":
      return "accent";
    case "moving_out":
      return "draft";
    case "renewed":
      return "sent";
    case "lost":
      return "failed";
    default:
      return "neutral";
  }
}
