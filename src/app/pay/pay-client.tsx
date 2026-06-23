"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { CommerceProduct, CommerceProductKey } from "@/lib/commerce/catalog";

export type PublicPayProduct = Omit<CommerceProduct, "currency"> & {
  currency: "usd";
  configured: boolean;
  priceLabel: string;
};

type FormState = {
  customerName: string;
  customerEmail: string;
  requestedWorkspaceEmail: string;
  phone: string;
  referralHasAgent: "yes" | "no" | "";
  referralAgentName: string;
  message: string;
};

const initialForm: FormState = {
  customerName: "",
  customerEmail: "",
  requestedWorkspaceEmail: "",
  phone: "",
  referralHasAgent: "",
  referralAgentName: "",
  message: "",
};

function productIcon(category: PublicPayProduct["category"]) {
  if (category === "workspace") return <Mail className="size-4" />;
  if (category === "desk_fee") return <CalendarClock className="size-4" />;
  if (category === "membership") return <Building2 className="size-4" />;
  return <BadgeDollarSign className="size-4" />;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-50">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function inputClass() {
  return "h-11 w-full rounded-md border border-line bg-white px-3 text-[14px] text-ink outline-none transition focus:border-ink-30 focus:ring-3 focus:ring-line-soft";
}

export function PayClient({
  products,
  canceled,
  stripeConfigured,
  workspaceDomains,
}: {
  products: PublicPayProduct[];
  canceled: boolean;
  stripeConfigured: boolean;
  workspaceDomains: string[];
}) {
  const [selectedKey, setSelectedKey] = useState<CommerceProductKey>(
    "company_domain_email"
  );
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(canceled ? "Checkout was canceled." : null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.key === selectedKey) || products[0],
    [products, selectedKey]
  );

  const grouped = useMemo(
    () => ({
      subscriptions: products.filter((product) => product.billingMode === "subscription"),
      oneTime: products.filter((product) => product.billingMode === "payment"),
    }),
    [products]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!selectedProduct || submitting) return;
    setError(null);

    if (!stripeConfigured || !selectedProduct.configured) {
      setError(`${selectedProduct.priceEnvVar} is not configured.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKey: selectedProduct.key,
          ...form,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Checkout could not start.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not start.");
      setSubmitting(false);
    }
  }

  if (!selectedProduct) {
    return null;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-[1180px] px-5 py-6 md:px-8 md:py-10">
        <header className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
              <span
                className="flex size-7 items-center justify-center rounded-md text-white"
                style={{ background: "#8B5A3C" }}
              >
                <Building2 className="size-4" />
              </span>
              <span
                className="font-serif text-[22px] tracking-[0.04em]"
                style={{ color: "#8B5A3C" }}
              >
                HOMIX
              </span>
            </div>
            <h1 className="mt-5 max-w-2xl font-serif text-[42px] leading-[1.05] md:text-[54px]">
              Agent payments
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-6 text-ink-70">
              Memberships, desk fees, company email, and agent services.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px] text-ink-70">
            <div className="rounded-md border border-line bg-white px-3 py-2">
              <CreditCard className="mb-2 size-4 text-homix-accent" />
              Stripe Checkout
            </div>
            <div className="rounded-md border border-line bg-white px-3 py-2">
              <ShieldCheck className="mb-2 size-4 text-homix-green" />
              Secure billing
            </div>
            <div className="rounded-md border border-line bg-white px-3 py-2">
              <Mail className="mb-2 size-4 text-homix-amber" />
              Workspace
            </div>
          </div>
        </header>

        <main className="grid gap-8 py-8 lg:grid-cols-[1fr_420px]">
          <section className="space-y-8">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink-50">
                  Recurring
                </h2>
                <span className="text-[12px] text-ink-50">Auto-renewal</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {grouped.subscriptions.map((product) => (
                  <button
                    key={product.key}
                    type="button"
                    onClick={() => setSelectedKey(product.key)}
                    className="min-h-[210px] rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: product.key === selectedProduct.key ? "#1A1814" : "#E4DED2",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-8 items-center justify-center rounded-md bg-paper-deep text-ink">
                        {productIcon(product.category)}
                      </span>
                      {product.configured ? (
                        <CheckCircle2 className="size-4 text-homix-green" />
                      ) : (
                        <span className="text-[11px] text-homix-rose">Setup</span>
                      )}
                    </div>
                    <div className="mt-4 min-h-[52px] font-serif text-[24px] leading-[1.08]">
                      {product.name}
                    </div>
                    <p className="mt-3 min-h-[44px] text-[13px] leading-[1.45] text-ink-70">
                      {product.description}
                    </p>
                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <div className="font-mono text-[24px]">{product.priceLabel}</div>
                        <div className="mt-1 text-[12px] text-ink-50">
                          {product.recurrenceLabel}
                        </div>
                      </div>
                      {product.commissionLabel && (
                        <span className="rounded-full bg-homix-accent-soft px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-homix-accent">
                          {product.commissionLabel}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-ink-50">
                One-time
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {grouped.oneTime.map((product) => (
                  <button
                    key={product.key}
                    type="button"
                    onClick={() => setSelectedKey(product.key)}
                    className="min-h-[150px] rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: product.key === selectedProduct.key ? "#1A1814" : "#E4DED2",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md bg-paper-deep text-ink">
                        {productIcon(product.category)}
                      </span>
                      <div className="font-mono text-[22px]">{product.priceLabel}</div>
                    </div>
                    <div className="mt-4 font-serif text-[22px] leading-[1.1]">{product.name}</div>
                    <p className="mt-2 text-[13px] leading-[1.45] text-ink-70">
                      {product.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-lg border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-4 border-b border-line-soft pb-4">
              <div>
                <div className="text-[12px] uppercase tracking-[0.14em] text-ink-50">
                  Selected
                </div>
                <div className="mt-2 font-serif text-[28px] leading-[1.05]">
                  {selectedProduct.name}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[24px]">{selectedProduct.priceLabel}</div>
                {selectedProduct.recurrenceLabel && (
                  <div className="mt-1 text-[12px] text-ink-50">
                    {selectedProduct.recurrenceLabel}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Full name">
                <input
                  className={inputClass()}
                  value={form.customerName}
                  onChange={(event) => update("customerName", event.target.value)}
                  autoComplete="name"
                />
              </Field>

              <Field label="Receipt email">
                <input
                  className={inputClass()}
                  value={form.customerEmail}
                  onChange={(event) => update("customerEmail", event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                />
              </Field>

              {selectedProduct.requiresWorkspaceEmail && (
                <>
                  <Field label="Company email">
                    <input
                      className={inputClass()}
                      value={form.requestedWorkspaceEmail}
                      onChange={(event) => update("requestedWorkspaceEmail", event.target.value)}
                      placeholder={`name@${workspaceDomains[0] || "homixny.com"}`}
                      inputMode="email"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className={inputClass()}
                      value={form.phone}
                      onChange={(event) => update("phone", event.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </Field>
                </>
              )}

              {selectedProduct.requiresReferral && (
                <>
                  <Field label="Agent referral">
                    <div className="grid grid-cols-2 gap-2">
                      {(["yes", "no"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => update("referralHasAgent", value)}
                          className="h-10 rounded-md border text-[13px] transition"
                          style={{
                            borderColor:
                              form.referralHasAgent === value ? "#1A1814" : "#E4DED2",
                            background:
                              form.referralHasAgent === value ? "#EFEAE1" : "#FFFFFF",
                          }}
                        >
                          {value === "yes" ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  {form.referralHasAgent === "yes" && (
                    <Field label="Referral name">
                      <input
                        className={inputClass()}
                        value={form.referralAgentName}
                        onChange={(event) => update("referralAgentName", event.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}

              <Field label="Message">
                <textarea
                  className="min-h-[92px] w-full resize-y rounded-md border border-line bg-white px-3 py-3 text-[14px] text-ink outline-none transition focus:border-ink-30 focus:ring-3 focus:ring-line-soft"
                  value={form.message}
                  onChange={(event) => update("message", event.target.value)}
                />
              </Field>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-homix-rose-soft bg-homix-rose-soft px-3 py-2 text-[13px] text-homix-rose">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting || !selectedProduct.configured || !stripeConfigured}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-[14px] font-medium text-white transition hover:bg-ink-70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Opening Stripe
                </>
              ) : (
                <>
                  Checkout
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>

            <div className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-ink-50">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-homix-green" />
              <span>Payment details are collected by Stripe Checkout.</span>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
