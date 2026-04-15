"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
      toast.success("设置已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <p className="text-slate-500">加载中...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">设置</h1>
        <p className="mt-1 text-slate-500">配置邮件发送和公司信息</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>邮件设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>发件人邮箱 (From)</Label>
            <Input
              value={settings.from_email || ""}
              onChange={(e) => update("from_email", e.target.value)}
              placeholder="invoice@homixny.com"
            />
            <p className="text-xs text-slate-400">
              需要在 Resend 中验证此域名
            </p>
          </div>
          <div className="space-y-2">
            <Label>CC 邮箱</Label>
            <Input
              value={settings.cc_email || ""}
              onChange={(e) => update("cc_email", e.target.value)}
              placeholder="homix@homixny.com"
            />
            <p className="text-xs text-slate-400">
              所有发送的 Invoice 邮件都会抄送此邮箱
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>公司信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>公司名称</Label>
            <Input
              value={settings.company_name || ""}
              onChange={(e) => update("company_name", e.target.value)}
              placeholder="Homix Living"
            />
          </div>
          <div className="space-y-2">
            <Label>公司地址</Label>
            <Input
              value={settings.company_address || ""}
              onChange={(e) => update("company_address", e.target.value)}
              placeholder="123 Main St, New York, NY 10001"
            />
          </div>
          <div className="space-y-2">
            <Label>默认年份</Label>
            <Input
              value={settings.default_year || ""}
              onChange={(e) => update("default_year", e.target.value)}
              placeholder="2026"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? "保存中..." : "保存设置"}
      </Button>
    </div>
  );
}
