import { db } from "@/db";
import { invoices, buildings } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const totalBuildings = await db.select({ count: count() }).from(buildings);
  const totalInvoices = await db.select({ count: count() }).from(invoices);
  const sentInvoices = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "sent"));
  const draftInvoices = await db
    .select({ count: count() })
    .from(invoices)
    .where(eq(invoices.status, "draft"));

  const recentInvoices = await db
    .select({
      invoice: invoices,
      buildingName: buildings.name,
    })
    .from(invoices)
    .leftJoin(buildings, eq(invoices.buildingId, buildings.id))
    .orderBy(sql`${invoices.createdAt} DESC`)
    .limit(10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">OP Invoice 管理概览</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              大楼总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalBuildings[0].count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Invoice 总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInvoices[0].count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              已发送
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {sentInvoices[0].count}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              草稿
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {draftInvoices[0].count}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>最近 Invoice</CardTitle>
            <Link
              href="/invoices"
              className="text-sm text-blue-600 hover:underline"
            >
              查看全部
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-center py-8 text-slate-500">
              暂无 Invoice。
              <Link href="/invoices/new" className="text-blue-600 hover:underline ml-1">
                创建第一个 Invoice
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map(({ invoice, buildingName }) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-slate-500">
                      {buildingName} · {invoice.tenantName} · Unit {invoice.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
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
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
