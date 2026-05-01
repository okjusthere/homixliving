"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, EditorialInput, Icons, LabeledField, Pill } from "@/components/homix/primitives";
import { fmtMoney, tone } from "@/components/homix/tokens";
import type { Agent, Team } from "@/db/schema";

type TeamRow = {
  team: Team;
  leader: Agent | null;
  members: Agent[];
  memberCount: number;
  mtdDeals: number;
  mtdTake: number;
};

const emptyTeam: Partial<Team> = {
  name: "",
  leaderAgentId: null,
  notes: "",
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState<Partial<Team> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/teams")
      .then((r) => r.json())
      .then(setTeams)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (field: keyof Team, value: string | number | null) => {
    if (!editTeam) return;
    setEditTeam({ ...editTeam, [field]: value });
  };

  const handleSave = async () => {
    if (!editTeam?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: editTeam.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editTeam),
      });
      if (!res.ok) throw new Error();
      toast.success(editTeam.id ? "Team saved" : "Team created");
      setEditTeam(null);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editTeam?.id) return;
    if (!confirm(`Delete "${editTeam.name}"? Members will become unassigned.`)) return;
    try {
      const res = await fetch("/api/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTeam.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Team deleted");
      setEditTeam(null);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-2" style={{ color: tone.ink50 }}>
            Organization
          </div>
          <h1 className="font-serif" style={{ fontSize: 52, lineHeight: 0.95, color: tone.ink }}>
            Teams
          </h1>
          <p className="mt-3 text-[14px]" style={{ color: tone.ink70 }}>
            Member groups with month-to-date production totals.
          </p>
        </div>
        <Btn variant="primary" icon={<Icons.Plus />} onClick={() => setEditTeam(emptyTeam)}>
          Add Team
        </Btn>
      </div>

      {loading ? (
        <p className="text-[13px]" style={{ color: tone.ink50 }}>
          Loading…
        </p>
      ) : teams.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <div className="font-serif mb-2" style={{ fontSize: 24, color: tone.ink }}>
              No teams yet
            </div>
            <button className="text-[13px] underline" style={{ color: tone.accent }} onClick={() => setEditTeam(emptyTeam)}>
              Create your first team
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          {teams.map((row, index) => {
            const expanded = expandedId === row.team.id;
            return (
              <div key={row.team.id} style={{ borderBottom: index < teams.length - 1 ? `1px solid ${tone.lineSoft}` : "none" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(expanded ? null : row.team.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expanded ? null : row.team.id);
                    }
                  }}
                  className="w-full px-6 py-5 text-left grid items-center transition-colors hover:bg-[#FAF7F0]"
                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 120px" }}
                >
                  <div>
                    <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                      {row.team.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: tone.ink50 }}>
                      Leader: {row.leader?.name || "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <Pill tone="neutral">{row.memberCount} members</Pill>
                  </div>
                  <div className="font-serif" style={{ fontSize: 22, color: tone.ink }}>
                    {row.mtdDeals}
                  </div>
                  <div className="font-serif" style={{ fontSize: 22, color: tone.green }}>
                    ${fmtMoney(row.mtdTake)}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditTeam(row.team);
                      }}
                    >
                      Edit
                    </Btn>
                  </div>
                </div>
                {expanded && (
                  <div className="px-6 pb-5">
                    <div className="rounded-xl p-4" style={{ background: tone.paper, border: `1px solid ${tone.lineSoft}` }}>
                      {row.members.length === 0 ? (
                        <div className="text-[13px]" style={{ color: tone.ink50 }}>
                          No members assigned.
                        </div>
                      ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {row.members.map((member) => (
                            <div key={member.id} className="rounded-lg p-3" style={{ background: tone.card, border: `1px solid ${tone.line}` }}>
                              <div className="text-[13.5px]" style={{ color: tone.ink }}>
                                {member.name}
                              </div>
                              <div className="mt-1 text-[11.5px] font-mono" style={{ color: tone.ink50 }}>
                                {member.licenseNumber || "No license"} · {Number(member.splitPct || 0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {editTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8" style={{ background: "rgba(26, 24, 20, 0.4)", backdropFilter: "blur(4px)" }} onClick={() => setEditTeam(null)}>
          <div className="w-full max-w-xl rounded-2xl overflow-hidden" style={{ background: tone.card, border: `1px solid ${tone.line}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${tone.line}` }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tone.ink50 }}>
                  {editTeam.id ? "Edit" : "New"}
                </div>
                <div className="font-serif" style={{ fontSize: 26, color: tone.ink }}>
                  {editTeam.id ? editTeam.name : "Add team"}
                </div>
              </div>
              <button onClick={() => setEditTeam(null)} className="w-8 h-8 rounded-full" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                x
              </button>
            </div>
            <div className="px-8 py-6 space-y-4">
              <LabeledField label="Name *">
                <EditorialInput value={editTeam.name || ""} onChange={(v) => updateField("name", v)} placeholder="e.g. Manhattan" />
              </LabeledField>
              <LabeledField label="Leader">
                <select
                  value={editTeam.leaderAgentId || ""}
                  onChange={(e) => updateField("leaderAgentId", e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-10 rounded-lg px-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink }}
                >
                  <option value="">Unassigned</option>
                  {teams.flatMap((row) => row.members).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Notes">
                <textarea
                  value={editTeam.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg p-3 text-[13.5px] outline-none"
                  style={{ background: tone.card, border: `1px solid ${tone.line}`, color: tone.ink, resize: "vertical" }}
                />
              </LabeledField>
            </div>
            <div className="px-8 py-5 flex items-center justify-between" style={{ borderTop: `1px solid ${tone.line}`, background: tone.paper }}>
              <div>
                {editTeam.id && (
                  <Btn variant="danger" size="sm" icon={<Icons.Trash />} onClick={handleDelete}>
                    Delete
                  </Btn>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Btn variant="outline" onClick={() => setEditTeam(null)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
