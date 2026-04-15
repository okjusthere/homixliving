"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Building, LineItem } from "@/db/schema";

export default function NewInvoicePage() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentName, setAgentName] = useState("");
  const [licensedCompany, setLicensedCompany] = useState("");
  const [year, setYear] = useState(2026);
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, amount: 0 },
  ]);

  const selectedBuilding = buildings.find((b) => b.id === buildingId);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then(setBuildings);
  }, []);

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: string | number
  ) => {
    const updated = [...lineItems];
    (updated[index] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "unitPrice") {
      updated[index].amount =
        Number(updated[index].quantity) * Number(updated[index].unitPrice);
    }
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { description: "", quantity: 1, unitPrice: 0, amount: 0 },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) {
      toast.error("请选择大楼");
      return;
    }
    if (!unit || !tenantName || !licensedCompany) {
      toast.error("请填写所有必填字段");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId,
          unit,
          tenantName,
          agentEmail,
          agentName,
          licensedCompany,
          year,
          lineItems,
          totalAmount,
          notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to create invoice");
      const invoice = await res.json();
      toast.success("Invoice 创建成功");
      router.push(`/invoices/${invoice.id}`);
    } catch {
      toast.error("创建失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const filteredBuildings = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.region.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filteredBuildings.reduce<Record<string, Building[]>>(
    (acc, b) => {
      if (!acc[b.region]) acc[b.region] = [];
      acc[b.region].push(b);
      return acc;
    },
    {}
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">创建 Invoice</h1>
        <p className="mt-1 text-slate-500">填写信息生成 OP Invoice</p>
      </div>

      {/* Building Selection */}
      <Card>
        <CardHeader>
          <CardTitle>选择大楼</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="搜索大楼..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {selectedBuilding ? (
            <div className="flex items-center justify-between rounded-lg border-2 border-blue-500 bg-blue-50 p-3">
              <div>
                <p className="font-medium">{selectedBuilding.name}</p>
                <p className="text-sm text-slate-500">
                  {selectedBuilding.region}
                  {selectedBuilding.managementCompany &&
                    ` · ${selectedBuilding.managementCompany}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBuildingId(null)}
              >
                更换
              </Button>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              {Object.entries(grouped).map(([region, rBuildings]) => (
                <div key={region}>
                  <div className="sticky top-0 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase">
                    {region} ({rBuildings.length})
                  </div>
                  {rBuildings.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-0"
                      onClick={() => {
                        setBuildingId(b.id);
                        setSearch("");
                      }}
                    >
                      <p className="font-medium text-sm">{b.name}</p>
                      {b.managementCompany && (
                        <p className="text-xs text-slate-400">
                          {b.managementCompany}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {selectedBuilding?.specialNotes && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <strong>特殊要求：</strong> {selectedBuilding.specialNotes}
            </div>
          )}
          {selectedBuilding?.submissionNotes && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
              <strong>提交方式：</strong> {selectedBuilding.submissionNotes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tenant Info */}
      <Card>
        <CardHeader>
          <CardTitle>租户信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="unit">Unit 号 *</Label>
            <Input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. 1201"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenantName">租户姓名 *</Label>
            <Input
              id="tenantName"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="e.g. John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="licensedCompany">持证公司 *</Label>
            <Input
              id="licensedCompany"
              value={licensedCompany}
              onChange={(e) => setLicensedCompany(e.target.value)}
              placeholder="e.g. Homix Realty"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">年份</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentName">经纪人姓名</Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Agent Zhang"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentEmail">经纪人邮箱 (Reply-To)</Label>
            <Input
              id="agentEmail"
              type="email"
              value={agentEmail}
              onChange={(e) => setAgentEmail(e.target.value)}
              placeholder="agent@example.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>费用明细</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
              + 添加行
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase px-1">
            <div className="col-span-5">描述</div>
            <div className="col-span-2">数量</div>
            <div className="col-span-2">单价</div>
            <div className="col-span-2">金额</div>
            <div className="col-span-1"></div>
          </div>
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-5"
                value={item.description}
                onChange={(e) =>
                  updateLineItem(index, "description", e.target.value)
                }
                placeholder="服务项目描述"
              />
              <Input
                className="col-span-2"
                type="number"
                value={item.quantity}
                onChange={(e) =>
                  updateLineItem(index, "quantity", Number(e.target.value))
                }
                min={1}
              />
              <Input
                className="col-span-2"
                type="number"
                value={item.unitPrice || ""}
                onChange={(e) =>
                  updateLineItem(index, "unitPrice", Number(e.target.value))
                }
                min={0}
                step={0.01}
                placeholder="0.00"
              />
              <div className="col-span-2 text-right font-medium">
                ${item.amount.toFixed(2)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="col-span-1"
                onClick={() => removeLineItem(index)}
                disabled={lineItems.length === 1}
              >
                ×
              </Button>
            </div>
          ))}
          <div className="flex justify-end border-t pt-3">
            <div className="text-lg font-bold">
              总计: ${totalAmount.toFixed(2)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>备注</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="可选备注信息..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Preview */}
      {buildingId && unit && (
        <Card>
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Invoice Number:</strong>{" "}
              {selectedBuilding?.invoiceNumberFormat
                ?.replace("Unit", unit)
                .replace("{year}", String(year)) ||
                `${unit}-${selectedBuilding?.name}-${year}`}
            </p>
            <p>
              <strong>文件名:</strong> {unit}-{selectedBuilding?.name}-Invoice-
              {licensedCompany || "???"}
            </p>
            <p>
              <strong>邮件标题:</strong> {unit}-{selectedBuilding?.name}-OP
              Invoice-{licensedCompany || "???"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading} className="px-8">
          {loading ? "创建中..." : "创建 Invoice"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
