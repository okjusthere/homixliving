import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { resources, type Resource } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { tone } from "@/components/homix/tokens";
import { Card, Pill } from "@/components/homix/server-primitives";
import { ResourceManager } from "@/components/resources/resource-manager";

export const metadata: Metadata = { title: "Resources · Homix Deals" };

function groupByCategory(items: Resource[]): [string, Resource[]][] {
  const map = new Map<string, Resource[]>();
  for (const it of items) {
    const key = it.category || "General";
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

export default async function ResourcesPage() {
  const session = await requireActiveAgent();
  const isAdmin = !!session.user.isAdmin;

  const all = await db
    .select()
    .from(resources)
    .orderBy(asc(resources.sortOrder), asc(resources.id));
  const visible = isAdmin ? all : all.filter((r) => r.isPublished);
  const groups = groupByCategory(visible);

  return (
    <div>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: tone.ink50 }}>
          Agent resources
        </div>
        <h1 className="font-serif mt-1" style={{ fontSize: 34, letterSpacing: "-0.02em", color: tone.ink }}>
          Resource library
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: tone.ink50 }}>
          SOPs, scripts, templates and brand assets — the playbooks for running a deal the Homix way.
        </p>
      </div>

      {isAdmin && <ResourceManager initialResources={all} />}

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[14px]" style={{ color: tone.ink50 }}>
            {isAdmin
              ? "No resources yet — add one above."
              : "Resources are being added. Check back soon."}
          </p>
        </Card>
      ) : (
        <div className="space-y-12">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 className="font-serif mb-4" style={{ fontSize: 20, color: tone.ink }}>
                {category}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((r) => (
                  <Card key={r.id} className="p-5 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
                        {r.title}
                      </h3>
                      {!r.isPublished && <Pill tone="draft">Hidden</Pill>}
                    </div>
                    {r.description && (
                      <p className="mt-2 flex-1 text-[13px] leading-relaxed" style={{ color: tone.ink70 }}>
                        {r.description}
                      </p>
                    )}
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium"
                      style={{ color: tone.accent }}
                    >
                      Open ↗
                    </a>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
