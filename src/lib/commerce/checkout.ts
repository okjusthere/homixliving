import {
  getCommerceProduct,
  type CommerceProduct,
  type CommerceProductKey,
} from "./catalog";
import { getWorkspaceAllowedDomains } from "@/lib/google-workspace";

export type CheckoutPayload = {
  productKey: CommerceProductKey;
  customerName: string;
  customerEmail: string;
  requestedWorkspaceEmail?: string | null;
  phone?: string | null;
  referralHasAgent?: "yes" | "no" | null;
  referralAgentName?: string | null;
  message?: string | null;
};

export type CheckoutValidationResult =
  | { ok: true; product: CommerceProduct; payload: CheckoutPayload }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function cleanEmail(value: unknown): string | null {
  const cleaned = cleanText(value, 254)?.toLowerCase() ?? null;
  if (!cleaned || !EMAIL_PATTERN.test(cleaned)) return null;
  return cleaned;
}

function cleanReferralChoice(value: unknown): "yes" | "no" | null {
  if (value === "yes" || value === "no") return value;
  return null;
}

export function isWorkspaceEmailAllowed(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return getWorkspaceAllowedDomains().includes(domain);
}

export function validateCheckoutPayload(input: unknown): CheckoutValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid checkout request." };
  }

  const body = input as Record<string, unknown>;
  const productKey = cleanText(body.productKey, 80);
  const product = productKey ? getCommerceProduct(productKey) : null;

  if (!product) {
    return { ok: false, error: "Unknown product." };
  }

  const customerName = cleanText(body.customerName, 120);
  const customerEmail = cleanEmail(body.customerEmail);

  if (!customerName) {
    return { ok: false, error: "Customer name is required." };
  }

  if (!customerEmail) {
    return { ok: false, error: "Valid customer email is required." };
  }

  const requestedWorkspaceEmail = cleanEmail(body.requestedWorkspaceEmail);
  if (product.requiresWorkspaceEmail) {
    if (!requestedWorkspaceEmail) {
      return { ok: false, error: "Valid company email address is required." };
    }
    if (!isWorkspaceEmailAllowed(requestedWorkspaceEmail)) {
      return { ok: false, error: "Company email must use an approved Homix domain." };
    }
  }

  const referralHasAgent = cleanReferralChoice(body.referralHasAgent);
  if (product.requiresReferral && !referralHasAgent) {
    return { ok: false, error: "Referral answer is required." };
  }

  const referralAgentName = cleanText(body.referralAgentName, 160);
  if (product.requiresReferral && referralHasAgent === "yes" && !referralAgentName) {
    return { ok: false, error: "Referral agent name is required." };
  }

  return {
    ok: true,
    product,
    payload: {
      productKey: product.key,
      customerName,
      customerEmail,
      requestedWorkspaceEmail,
      phone: cleanText(body.phone, 40),
      referralHasAgent,
      referralAgentName,
      message: cleanText(body.message, 500),
    },
  };
}
