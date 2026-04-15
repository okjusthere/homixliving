"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type InvoiceRow = {
  invoice: {
    id: number;
    invoiceNumber: string;
    unit: string;
    tenantName: string;
    totalAmount: number;
    status: string;
    createdAt: string;
    licensedCompany: string;
  };
  buildingName: string;
  buildingRegion: string;
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((data) => {
        setInvoices(data);
        setLoading(false);
      });
  }, []);

  const filtered = invoices.filter(
    (row) =>
      row.invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      row.invoice.tenantName.toLowerCase().includes(search.toLowerCase()) ||
      (row.buildingName || "").toLowerCase().includes(search.toLowerCase()) ||
      row.invoice.unit.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Invoice 列表</h1>
          <p className="mt-1 text-slate-500">
            共 {invoices.length} 个 Invoice
          </p>
        </div>
        <Link href="/invoices/new">
          <Button>+ 创建 Invoice</Button>
        </Link>
      </div>

      <Input
        placeholder="搜索 Invoice Number、租户、大楼..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <p className="text-slate-500">加载中...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {invoices.length === 0 ? (
              <p>
                暂无 Invoice。
                <Link
                  href="/invoices/new"
                  className="text-blue-600 hover:underline ml-1"
                >
                  创建第一个
                </Link>
              </p>
            ) : (
              "没有匹配的结果"
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ invoice, buildingName }) => (
            <Link
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              className="block"
            >
              <Card className="hover:bg-slate-50 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-sm text-slate-500">
                        {buildingName} · Unit {invoice.unit} ·{" "}
                        {invoice.tenantName} · {invoice.licensedCompany}
                      </p>
                      <p className="text-xs text-slate-400">
                        {invoice.createdAt
                          ? new Date(invoice.createdAt).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-medium">
                        ${invoice.totalAmount.toFixed(2)}
                      </span>
                      <Badge
                        variant={
                          invoice.status === "sent"
                            ? "default"
                            : invoice.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {invoice.status === "sent"
                          ? "已发送"
                          : invoice.status === "failed"
                          ? "失败"
                          : "草稿"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
