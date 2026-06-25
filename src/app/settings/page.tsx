"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  EditorialInput,
  LabeledField,
} from "@/components/homix/primitives";
import { PageHeader, CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    loading: "Loading…",
    eyebrow: "Configuration",
    title: "Settings",
    description: "Email delivery, company details, and payment options.",
    saving: "Saving…",
    saveChanges: "Save Changes",
    settingsSaved: "Settings saved",
    saveFailed: "Save failed",
    emailTitle: "Email",
    emailSubtitle: "How invoices are delivered",
    fromEmail: "From email",
    ccEmail: "CC email (always)",
    verifyDomain: "Verify the sending domain with Resend before sending.",
    companyTitle: "Company",
    companySubtitle: "Shown on every invoice",
    companyName: "Company name",
    companyAddress: "Company address",
    defaultYear: "Default year",
    checkTitle: "Payment · Check",
    checkSubtitle: "Appears in the Payment Methods block",
    payableTo: "Payable to",
    taxId: "Tax ID",
    mailCheckTo: "Mail check to",
    achTitle: "Payment · ACH",
    achSubtitle: "Domestic ACH transfer details",
    accountName: "Account name",
    bankName: "Bank name",
    routing: "Routing",
    accountNo: "Account №",
    wireTitle: "Payment · Wire",
    wireSubtitle: "Wire transfer details (separate from ACH)",
    wireRouting: "Wire routing / ABA",
    bankAddress: "Bank address",
    swift: "SWIFT / BIC (international)",
  },
  zh: {
    loading: "加载中…",
    eyebrow: "配置",
    title: "设置",
    description: "邮件发送、公司信息及付款方式。",
    saving: "保存中…",
    saveChanges: "保存",
    settingsSaved: "设置已保存",
    saveFailed: "保存失败",
    emailTitle: "邮件",
    emailSubtitle: "发票的发送方式",
    fromEmail: "发件邮箱",
    ccEmail: "抄送邮箱（每封）",
    verifyDomain: "发送前请先在 Resend 验证发送域名。",
    companyTitle: "公司",
    companySubtitle: "显示在每张发票上",
    companyName: "公司名称",
    companyAddress: "公司地址",
    defaultYear: "默认年份",
    checkTitle: "付款 · 支票",
    checkSubtitle: "显示在付款方式区块中",
    payableTo: "收款方",
    taxId: "税号",
    mailCheckTo: "支票邮寄至",
    achTitle: "付款 · ACH",
    achSubtitle: "美国境内 ACH 转账信息",
    accountName: "账户名称",
    bankName: "银行名称",
    routing: "路由号",
    accountNo: "账号",
    wireTitle: "付款 · 电汇",
    wireSubtitle: "电汇信息（与 ACH 分开）",
    wireRouting: "电汇路由号 / ABA",
    bankAddress: "银行地址",
    swift: "SWIFT / BIC（国际）",
  },
} as const;

export default function SettingsPage() {
  const t = M[useLocale()];
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
      toast.success(t.settingsSaved);
    } catch {
      toast.error(t.saveFailed);
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
        {t.loading}
      </p>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? t.saving : t.saveChanges}
          </Btn>
        }
      />

      <div className="grid grid-cols-2 gap-6">
        {/* Email */}
        <Card>
          <CardHeader title={t.emailTitle} subtitle={t.emailSubtitle} />
          <div className="p-6 space-y-4">
            <LabeledField label={t.fromEmail}>
              <EditorialInput
                value={settings.from_email || ""}
                onChange={(v) => update("from_email", v)}
                placeholder="invoice@homixny.com"
                mono
              />
            </LabeledField>
            <LabeledField label={t.ccEmail}>
              <EditorialInput
                value={settings.cc_email || ""}
                onChange={(v) => update("cc_email", v)}
                placeholder="homix@homixny.com"
                mono
              />
            </LabeledField>
            <p className="text-[11.5px]" style={{ color: tone.ink50 }}>
              {t.verifyDomain}
            </p>
          </div>
        </Card>

        {/* Company */}
        <Card>
          <CardHeader title={t.companyTitle} subtitle={t.companySubtitle} />
          <div className="p-6 space-y-4">
            <LabeledField label={t.companyName}>
              <EditorialInput
                value={settings.company_name || ""}
                onChange={(v) => update("company_name", v)}
                placeholder="Homix Living"
              />
            </LabeledField>
            <LabeledField label={t.companyAddress}>
              <EditorialInput
                value={settings.company_address || ""}
                onChange={(v) => update("company_address", v)}
                placeholder="5 West 37th Street, Floor 2, New York, NY 10018"
              />
            </LabeledField>
            <LabeledField label={t.defaultYear}>
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
          <CardHeader
            title={t.checkTitle}
            subtitle={t.checkSubtitle}
          />
          <div className="p-6 space-y-4">
            <LabeledField label={t.payableTo}>
              <EditorialInput
                value={settings.payable_to || ""}
                onChange={(v) => update("payable_to", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label={t.taxId}>
              <EditorialInput
                value={settings.tax_id || ""}
                onChange={(v) => update("tax_id", v)}
                placeholder="XX-XXXXXXX"
                mono
              />
            </LabeledField>
            <LabeledField label={t.mailCheckTo}>
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
          <CardHeader
            title={t.achTitle}
            subtitle={t.achSubtitle}
          />
          <div className="p-6 space-y-4">
            <LabeledField label={t.accountName}>
              <EditorialInput
                value={settings.ach_account_name || ""}
                onChange={(v) => update("ach_account_name", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label={t.bankName}>
              <EditorialInput
                value={settings.ach_bank_name || ""}
                onChange={(v) => update("ach_bank_name", v)}
                placeholder="Chase Bank"
              />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label={t.routing}>
                <EditorialInput
                  value={settings.ach_routing_number || ""}
                  onChange={(v) => update("ach_routing_number", v)}
                  placeholder="021000021"
                  mono
                />
              </LabeledField>
              <LabeledField label={t.accountNo}>
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
          <CardHeader
            title={t.wireTitle}
            subtitle={t.wireSubtitle}
          />
          <div className="p-6 space-y-4">
            <LabeledField label={t.accountName}>
              <EditorialInput
                value={settings.wire_account_name || ""}
                onChange={(v) => update("wire_account_name", v)}
                placeholder="Homix Living Inc."
              />
            </LabeledField>
            <LabeledField label={t.bankName}>
              <EditorialInput
                value={settings.wire_bank_name || ""}
                onChange={(v) => update("wire_bank_name", v)}
                placeholder="Chase Bank"
              />
            </LabeledField>
            <div className="grid grid-cols-2 gap-3">
              <LabeledField label={t.wireRouting}>
                <EditorialInput
                  value={settings.wire_routing_number || ""}
                  onChange={(v) => update("wire_routing_number", v)}
                  placeholder="021000021"
                  mono
                />
              </LabeledField>
              <LabeledField label={t.accountNo}>
                <EditorialInput
                  value={settings.wire_account_number || ""}
                  onChange={(v) => update("wire_account_number", v)}
                  placeholder="••••••4823"
                  mono
                />
              </LabeledField>
            </div>
            <LabeledField label={t.bankAddress}>
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
            <LabeledField label={t.swift}>
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
          {saving ? t.saving : t.saveChanges}
        </Btn>
      </div>
    </div>
  );
}
