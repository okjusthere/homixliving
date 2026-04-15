"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Building, Invoice, LineItem } from "@/db/schema";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [building, setBuilding] = useState<Building | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/invoices/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setInvoice(data.invoice);
        setBuilding(data.building);
        setLoading(false);
      });
  }, [params.id]);

  const handleDownloadPDF = () => {
    window.open(`/api/invoices/${params.id}/pdf`, "_blank");
  };

  const handleSendEmail = async () => {
    if (!building?.contactEmail) {
      toast.error("该大楼未配置收件邮箱，请先在大楼管理中添加邮箱地址");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`/api/invoices/${params.id}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Invoice 已发送！");
      // Refresh
      const updated = await fetch(`/api/invoices/${params.id}`).then((r) =>
        r.json()
      );
      setInvoice(updated.invoice);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "发送失败";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除这个 Invoice 吗？")) return;
    await fetch(`/api/invoices/${params.id}`, { method: "DELETE" });
    toast.success("Invoice 已删除");
    router.push("/invoices");
  };

  if (loading) return <p className="text-slate-500">加载中...</p>;
  if (!invoice || !building)
    return <p className="text-slate-500">Invoice 未找到</p>;

  const lineItems: LineItem[] =
    typeof invoice.lineItems === "string"
      ? JSON.parse(invoice.lineItems)
      : invoice.lineItems || [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {invoice.invoiceNumber}
          </h1>
          <p className="mt-1 text-slate-500">
            {building.name} · Unit {invoice.unit}
          </p>
        </div>
        <Badge
          variant={
            invoice.status === "sent"
              ? "default"
              : invoice.status === "failed"
              ? "destructive"
              : "secondary"
          }
          className="text-base px-4 py-1"
        >
          {invoice.status === "sent"
            ? "已发送"
            : invoice.status === "failed"
            ? "失败"
            : "草稿"}
        </Badge>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleDownloadPDF}>下载 PDF</Button>
        <Button
          onClick={handleSendEmail}
          disabled={sending || invoice.status === "sent"}
          variant={invoice.status === "sent" ? "outline" : "default"}
        >
          {sending
            ? "发送中..."
            : invoice.status === "sent"
            ? "已发送"
            : "发送邮件"}
        </Button>
        <Button variant="destructive" onClick={handleDelete}>
          删除
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          返回
        </Button>
      </div>

      {building.specialNotes && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <strong>特殊要求：</strong> {building.specialNotes}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoice 信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice Number</span>
              <span className="font-medium">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">文件名</span>
              <span className="font-medium">{invoice.fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">邮件标题</span>
              <span className="font-medium">{invoice.emailSubject}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">年份</span>
              <span className="font-medium">{invoice.year}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">创建时间</span>
              <span className="font-medium">
                {invoice.createdAt
                  ? new Date(invoice.createdAt).toLocaleString()
                  : "-"}
              </span>
            </div>
            {invoice.sentAt && (
              <div className="flex justify-between">
                <span className="text-slate-500">发送时间</span>
                <span className="font-medium">
                  {new Date(invoice.sentAt).toLocaleString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">租户 & 经纪人</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">租户</span>
              <span className="font-medium">{invoice.tenantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Unit</span>
              <span className="font-medium">{invoice.unit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">持证公司</span>
              <span className="font-medium">{invoice.licensedCompany}</span>
            </div>
            {invoice.agentName && (
              <div className="flex justify-between">
                <span className="text-slate-500">经纪人</span>
                <span className="font-medium">{invoice.agentName}</span>
              </div>
            )}
            {invoice.agentEmail && (
              <div className="flex justify-between">
                <span className="text-slate-500">经纪人邮箱</span>
                <span className="font-medium">{invoice.agentEmail}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">费用明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase">
              <div className="col-span-6">描述</div>
              <div className="col-span-2 text-center">数量</div>
              <div className="col-span-2 text-right">单价</div>
              <div className="col-span-2 text-right">金额</div>
            </div>
            <Separator />
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 py-1">
                <div className="col-span-6">{item.description}</div>
                <div className="col-span-2 text-center">{item.quantity}</div>
                <div className="col-span-2 text-right">
                  ${item.unitPrice.toFixed(2)}
                </div>
                <div className="col-span-2 text-right font-medium">
                  ${item.amount.toFixed(2)}
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-end text-lg font-bold pt-2">
              总计: ${invoice.totalAmount.toFixed(2)}
            </div>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">备注</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">大楼信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">大楼</span>
            <span className="font-medium">{building.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">区域</span>
            <span className="font-medium">{building.region}</span>
          </div>
          {building.managementCompany && (
            <div className="flex justify-between">
              <span className="text-slate-500">管理公司</span>
              <span className="font-medium">{building.managementCompany}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Bill To</span>
            <span className="font-medium">{building.billToCompany}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">提交方式</span>
            <span className="font-medium">{building.submissionNotes}</span>
          </div>
          {building.contactEmail && (
            <div className="flex justify-between">
              <span className="text-slate-500">收件邮箱</span>
              <span className="font-medium">{building.contactEmail}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
