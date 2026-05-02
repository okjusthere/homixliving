"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  EditorialInput,
  LabeledField,
} from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <p className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-2"
            style={{ color: tone.ink50 }}
          >
            Configuration
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 52,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: tone.ink,
            }}
          >
            Settings
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            Email delivery, company details, and payment options.
          </p>
        </div>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Btn>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Email */}
        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Email
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              How invoices are delivered
            </div>
          </div>
          <div className="p-6 space-y-4">
            <LabeledField label="From email">
              <EditorialInput
                value={settings.from_email || ""}
                onChange={(v) => update("from_email", v)}
                placeholder="invoice@homixny.com"
                mono
              />
            </LabeledField>
            <LabeledField label="CC email (always)">
              <EditorialInput
                value={settings.cc_email || ""}
                onChange={(v) => update("cc_email", v)}
                placeholder="homix@homixny.com"
                mono
              />
            </LabeledField>
            <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
              Verify the sending domain with Resend before sending.
            </p>
          </div>
        </Card>

        {/* Company */}
        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Company
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Shown on every invoice
            </div>
          </div>
          <div className="p-6 space-y-4">
            <LabeledField label="Company name">
              <EditorialInput
                value={settings.company_name || ""}
                onChange={(v) => update("company_name", v)}
                placeholder="Homix Living"
              />
            </LabeledField>
            <LabeledField label="Company address">
              <EditorialInput
                value={settings.company_address || ""}
                onChange={(v) => update("company_address", v)}
                placeholder="5 West 37th Street, Floor 2, New York, NY 10018"
              />
            </LabeledField>
            <LabeledField label="Default year">
              <EditorialInput
                value={settings.default_year || ""}
                onChange={(v) => update("default_year", v)}
                placeholder="2026"
                mono
              />
            </LabeledField>
          </div>
        </Card>

        {/* Payment — Check */}
        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Payment · Check
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Appears in the Payment Methods block
            </div>
          </div>
          <div className="p-6 space-y-4">
            <LabeledField label="Payable to">
              <EditorialInput
                value={settings.payable_to || ""}
                onChange={(v) => update("payable_to", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label="Tax ID">
              <EditorialInput
                value={settings.tax_id || ""}
                onChange={(v) => update("tax_id", v)}
                placeholder="XX-XXXXXXX"
                mono
              />
            </LabeledField>
            <LabeledField label="Mail check to">
              <textarea
                value={settings.mail_check_address || ""}
                onChange={(e) => update("mail_check_address", e.target.value)}
                rows={4}
                placeholder="Homix Living Inc.&#10;5 West 37th Street, Floor 2&#10;New York, NY 10018"
                className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                style={{
                  background: tone.card,
                  border: `1px solid ${tone.line}`,
                  color: tone.ink,
                  resize: "vertical",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              />
            </LabeledField>
          </div>
        </Card>

        {/* Payment — ACH */}
        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Payment · ACH
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Domestic ACH transfer details
            </div>
          </div>
          <div className="p-6 space-y-4">
            <LabeledField label="Account name">
              <EditorialInput
                value={settings.ach_account_name || ""}
                onChange={(v) => update("ach_account_name", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label="Bank name">
              <EditorialInput
                value={settings.ach_bank_name || ""}
                onChange={(v) => update("ach_bank_name", v)}
                placeholder="Chase Bank"
              />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Routing">
                <EditorialInput
                  value={settings.ach_routing_number || ""}
                  onChange={(v) => update("ach_routing_number", v)}
                  placeholder="021000021"
                  mono
                />
              </LabeledField>
              <LabeledField label="Account №">
                <EditorialInput
                  value={settings.ach_account_number || ""}
                  onChange={(v) => update("ach_account_number", v)}
                  placeholder="••••••4823"
                  mono
                />
              </LabeledField>
            </div>
          </div>
        </Card>

        {/* Payment — Wire */}
        <Card>
          <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
            <div
              className="font-serif"
              style={{ fontSize: 20, color: tone.ink, letterSpacing: "-0.01em" }}
            >
              Payment · Wire
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
              Wire transfer details (separate from ACH)
            </div>
          </div>
          <div className="p-6 space-y-4">
            <LabeledField label="Account name">
              <EditorialInput
                value={settings.wire_account_name || ""}
                onChange={(v) => update("wire_account_name", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label="Bank name">
              <EditorialInput
                value={settings.wire_bank_name || ""}
                onChange={(v) => update("wire_bank_name", v)}
                placeholder="Chase Bank"
              />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label="Wire routing / ABA">
                <EditorialInput
                  value={settings.wire_routing_number || ""}
                  onChange={(v) => update("wire_routing_number", v)}
                  placeholder="021000021"
                  mono
                />
              </LabeledField>
              <LabeledField label="Account №">
                <EditorialInput
                  value={settings.wire_account_number || ""}
                  onChange={(v) => update("wire_account_number", v)}
                  placeholder="••••••4823"
                  mono
                />
              </LabeledField>
            </div>
            <LabeledField label="Bank address">
              <textarea
                value={settings.wire_bank_address || ""}
                onChange={(e) => update("wire_bank_address", e.target.value)}
                rows={3}
                placeholder="JPMorgan Chase Bank, N.A.&#10;270 Park Avenue&#10;New York, NY 10017"
                className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                style={{
                  background: tone.card,
                  border: `1px solid ${tone.line}`,
                  color: tone.ink,
                  resize: "vertical",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              />
            </LabeledField>
            <LabeledField label="SWIFT / BIC (international)">
              <EditorialInput
                value={settings.wire_swift_code || ""}
                onChange={(v) => update("wire_swift_code", v)}
                placeholder="CHASUS33"
                mono
              />
            </LabeledField>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Btn>
      </div>
    </div>
  );
}
