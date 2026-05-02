"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { fmtMoney, tone } from "@/components/homix/tokens";
import type { Agent, Team } from "@/db/schema";

type AgentRow = {
  agent: Agent;
  teamName: string | null;
  mtdDeals: number;
  mtdTake: number;
};

const emptyAgent: Partial<Agent> = {
  name: "",
  email: "",
  phone: "",
  licenseNumber: "",
  licensedCompany: "Homix Living Inc.",
  splitPct: 50,
  teamId: null,
  isActive: true,
  joinedAt: "",
  notes: "",
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function AgentsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Partial<Agent> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAgents = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([agentRows, teamRows]) => {
        setAgents(agentRows);
        setTeams(teamRows);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated" && !session.user.isAdmin) {
      router.replace("/");
      return;
    }
    if (status === "authenticated" && session.user.isAdmin) {
      fetchAgents();
    }
  }, [router, session?.user.isAdmin, status]);

  const pending = useMemo(
    () => agents.filter((row) => row.agent.isActive === false),
    [agents]
  );

  const filtered = useMemo(() => {
    const activeAgents = agents.filter((row) => row.agent.isActive !== false);
    if (!search) return activeAgents;
    const q = search.toLowerCase();
    return activeAgents.filter(
      ({ agent, teamName }) =>
        agent.name.toLowerCase().includes(q) ||
        (agent.email || "").toLowerCase().includes(q) ||
        (agent.licenseNumber || "").toLowerCase().includes(q) ||
        (teamName || "").toLowerCase().includes(q)
    );
  }, [agents, search]);

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/agents/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Agent approved");
      fetchAgents();
    } catch {
      toast.error("Could not approve");
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this agent's access?")) return;
    try {
      const res = await fetch(`/api/agents/${id}/approve`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Access revoked");
      fetchAgents();
    } catch {
      toast.error("Could not revoke");
    }
  };

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, AgentRow[]>>((acc, row) => {
      const key = row.teamName || "Unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
  }, [filtered]);

  const updateField = (field: keyof Agent, value: string | number | boolean | null) => {
    if (!editAgent) return;
    setEditAgent({ ...editAgent, [field]: value });
  };

  const closeDialog = () => {
    setEditAgent(null);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!editAgent?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: editAgent.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAgent),
      });
      if (!res.ok) throw new Error();
      toast.success(editAgent.id ? "Agent saved" : "Agent created");
      closeDialog();
      fetchAgents();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (status !== "authenticated" || !session?.user.isAdmin) {
    return (
      <div className="py-24 text-center text-[13px]" style={{ color: tone.ink50 }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Team
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Agents
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            {filtered.length} active broker{filtered.length === 1 ? "" : "s"} across {Object.keys(grouped).length} team{Object.keys(grouped).length === 1 ? "" : "s"}.
          </p>
        </div>
        <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditAgent(emptyAgent)}>
          Add Agent
        </Btn>
      </div>

      <div className="flex items-center gap-2 h-10 px-3 rounded-md max-w-md" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
        <span style={{ color: tone.ink30 }}>
          <Icons.Search />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, team, license, email..."
          className="flex-1 bg-transparent outline-none text-[13.5px]"
          style={{ color: tone.ink }}
        />
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <Card>
          <div
            className="px-6 py-5 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
          >
            <div>
              <div
                className="font-serif flex items-center gap-3"
                style={{ fontSize: 22, color: tone.ink, letterSpacing: "-0.01em" }}
              >
                Pending approvals
                <Pill tone="draft">{pending.length}</Pill>
              </div>
              <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                New brokers awaiting activation
              </div>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
            {pending.map(({ agent }) => (
              <div
                key={agent.id}
                className="grid items-center px-6 py-4"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 16,
                  borderBottom: `1px solid ${tone.lineSoft}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-medium"
                  style={{ background: tone.amberSoft, color: tone.amber, fontSize: 12 }}
                >
                  {initials(agent.name)}
                </div>
                <div>
                  <div className="text-[14px]" style={{ color: tone.ink }}>
                    {agent.name}
                  </div>
                  <div className="text-[12px] mt-0.5 font-mono" style={{ color: tone.ink50 }}>
                    {agent.email || "no email"}
                    {agent.joinedAt && (
                      <span> · joined {agent.joinedAt}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Btn
                    variant="outline"
                    size="sm"
                    onClick={() => setEditAgent(agent)}
                  >
                    Edit
                  </Btn>
                  <Btn
                    variant="primary"
                    size="sm"
                    icon={<Icons.Check />}
                    onClick={() => handleApprove(agent.id)}
                  >
                    Approve
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
              No agents yet
            </div>
            <button
              type="button"
              onClick={() => setEditAgent(emptyAgent)}
              className="text-[13px] underline"
              style={{ color: tone.accent }}
            >
              Add your first agent
            </button>
          </div>
        </Card>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([teamName, rows]) => (
            <Card key={teamName}>
              <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                <div className="font-serif flex items-center gap-3" style={{ fontSize: 22, color: tone.ink }}>
                  {teamName}
                  <Pill tone="neutral">{rows.length}</Pill>
                </div>
              </div>
              <div className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ agent, mtdDeals, mtdTake }) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="rounded-xl p-4 transition-colors hover:bg-[#FAF7F0]"
                    style={{ border: `1px solid ${tone.line}`, background: tone.card }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-serif shrink-0"
                        style={{ background: tone.accentSoft, color: tone.accent, fontSize: 18 }}
                      >
                        {initials(agent.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-serif truncate" style={{ fontSize: 20, color: tone.ink }}>
                          {agent.name}
                        </div>
                        <div className="text-[11.5px] mt-1 font-mono truncate" style={{ color: tone.ink50 }}>
                          {agent.licenseNumber || "No license #"}
                        </div>
                      </div>
                      <Pill tone="accent">{Number(agent.splitPct || 0)}%</Pill>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg p-3" style={{ background: tone.paper }}>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          Deals MTD
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          {mtdDeals}
                        </div>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: tone.paper }}>
                        <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.ink50 }}>
                          MTD Take
                        </div>
                        <div className="mt-1 font-serif" style={{ fontSize: 24, color: tone.ink }}>
                          ${fmtMoney(Number(mtdTake || 0))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-[12px]" style={{ color: tone.ink50 }}>
                      {agent.email || "No email"} {agent.phone ? `· ${agent.phone}` : ""}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ))
      )}

      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={closeDialog}>
          <div className="w-full max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  New
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink, marginTop: 2 }}>
                  Add agent
                </div>
              </div>
              <button onClick={closeDialog} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="flex-1 overflow-auto px-8 py-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LabeledField label="Name *">
                  <EditorialInput value={editAgent.name || ""} onChange={(v) => updateField("name", v)} placeholder="e.g. Alice Chen" />
                </LabeledField>
                <LabeledField label="Team">
                  <select
                    value={editAgent.teamId || ""}
                    onChange={(e) => updateField("teamId", e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                    style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                  >
                    <option value="">Unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Email">
                  <EditorialInput value={editAgent.email || ""} onChange={(v) => updateField("email", v)} placeholder="agent@homixny.com" mono />
                </LabeledField>
                <LabeledField label="Phone">
                  <EditorialInput value={editAgent.phone || ""} onChange={(v) => updateField("phone", v)} placeholder="(917) 555-0101" mono />
                </LabeledField>
                <LabeledField label="License #">
                  <EditorialInput value={editAgent.licenseNumber || ""} onChange={(v) => updateField("licenseNumber", v)} mono />
                </LabeledField>
                <LabeledField label="Split %">
                  <EditorialInput value={editAgent.splitPct || 50} onChange={(v) => updateField("splitPct", Number(v))} type="number" mono />
                </LabeledField>
                <LabeledField label="Licensed company">
                  <EditorialInput value={editAgent.licensedCompany || ""} onChange={(v) => updateField("licensedCompany", v)} />
                </LabeledField>
                <LabeledField label="Joined">
                  <EditorialInput value={editAgent.joinedAt || ""} onChange={(v) => updateField("joinedAt", v)} type="date" mono />
                </LabeledField>
              </div>
              <LabeledField label="Notes">
                <textarea
                  value={editAgent.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
            </div>
            <div className="px-8 py-5 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editAgent.id && editAgent.isActive && (
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      handleRevoke(editAgent.id!);
                      closeDialog();
                    }}
                  >
                    Revoke access
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={closeDialog}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : editAgent.id ? "Save" : "Add agent"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
