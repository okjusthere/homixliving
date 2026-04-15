"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Building } from "@/db/schema";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then((data) => {
        setBuildings(data);
        setLoading(false);
      });
  }, []);

  const filtered = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.region.toLowerCase().includes(search.toLowerCase()) ||
      (b.managementCompany || "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, Building[]>>((acc, b) => {
    const key = b.region;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">大楼管理</h1>
          <p className="mt-1 text-slate-500">
            共 {buildings.length} 个大楼
          </p>
        </div>
      </div>

      <Input
        placeholder="搜索大楼名称、区域或管理公司..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <p className="text-slate-500">加载中...</p>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([region, regionBuildings]) => (
            <Card key={region}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {region}
                  <Badge variant="secondary">{regionBuildings.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {regionBuildings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border p-3 hover:bg-slate-50 transition-colors"
                    >
                      <p className="font-medium">{b.name}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        {b.managementCompany && (
                          <span className="text-blue-600">
                            {b.managementCompany}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {b.submissionNotes}
                      </p>
                      {b.billToCompany && (
                        <p className="text-xs text-slate-500 mt-1">
                          Bill to: {b.billToCompany}
                        </p>
                      )}
                      {b.specialNotes && (
                        <p className="text-xs text-red-500 mt-1">
                          ⚠ {b.specialNotes}
                        </p>
                      )}
                      {b.isOutOfState && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          外州
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}
