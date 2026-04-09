import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { PipelineStep } from "../../api/pipelines";
import type { CompanyMember } from "../../api/access";

interface StepSidePanelProps {
  step: PipelineStep;
  allSteps: PipelineStep[];
  agents: Array<{ id: string; name: string }>;
  members: CompanyMember[];
  issues: Array<{ id: string; title: string; identifier?: string | null }>;
  onSave: (stepId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

type BranchForm = {
  id: string;
  label: string;
  condition: { field: string; operator: string; value: string } | null;
  nextStepIds: string[];
};

const FIELDS = ["status", "priority", "assigneeAgentId", "assigneeUserId"];
const OPERATORS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "in", label: "In list" },
  { value: "not_in", label: "Not in list" },
];

export function StepSidePanel({ step, allSteps, agents, members, issues, onSave, onClose }: StepSidePanelProps) {
  const [name, setName] = useState(step.name);
  const [assigneeType, setAssigneeType] = useState<"agent" | "user" | "">(step.assigneeType ?? "");
  const [agentId, setAgentId] = useState(step.agentId ?? "");
  const [assigneeUserId, setAssigneeUserId] = useState(step.assigneeUserId ?? "");
  const [issueId, setIssueId] = useState(step.issueId ?? "");
  const [branches, setBranches] = useState<BranchForm[]>(() => {
    const config = step.config as { branches?: BranchForm[] };
    return config.branches ?? [
      { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
      { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
    ];
  });

  useEffect(() => {
    setName(step.name);
    setAssigneeType(step.assigneeType ?? "");
    setAgentId(step.agentId ?? "");
    setAssigneeUserId(step.assigneeUserId ?? "");
    setIssueId(step.issueId ?? "");
    const config = step.config as { branches?: BranchForm[] };
    setBranches(config.branches ?? [
      { id: "branch-yes", label: "Yes", condition: { field: "status", operator: "eq", value: "done" }, nextStepIds: [] },
      { id: "branch-no", label: "No", condition: null, nextStepIds: [] },
    ]);
  }, [step]);

  function handleSave() {
    const data: Record<string, unknown> = { name };
    if (step.stepType === "action") {
      if (assigneeType === "agent") {
        data.assigneeType = "agent";
        data.agentId = agentId || null;
        data.assigneeUserId = null;
      } else if (assigneeType === "user") {
        data.assigneeType = "user";
        data.assigneeUserId = assigneeUserId || null;
        data.agentId = null;
      } else {
        data.agentId = null;
        data.assigneeUserId = null;
      }
      data.issueId = issueId || null;
    } else {
      data.config = { branches };
    }
    onSave(step.id, data);
  }

  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  return (
    <div className="w-80 border-l border-border bg-card h-full overflow-y-auto p-4 space-y-4 relative z-20">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{step.stepType === "if_else" ? "Edit Condition" : "Edit Step"}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring" />
      </div>

      {step.stepType === "action" && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Assignee</label>
            <div className="flex gap-1">
              {(["agent", "user", ""] as const).map((type) => (
                <button key={type || "none"} onClick={() => { setAssigneeType(type); setAgentId(""); setAssigneeUserId(""); }}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${assigneeType === type ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent"}`}>
                  {type === "agent" ? "Agent" : type === "user" ? "User" : "None"}
                </button>
              ))}
            </div>
          </div>
          {assigneeType === "agent" && (
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">Select agent...</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {assigneeType === "user" && (
            <select value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">Select member...</option>
              {members.filter((m) => m.principalType === "user" && m.status === "active").map((m) => (
                <option key={m.principalId} value={m.principalId}>{m.userDisplayName ?? m.userEmail ?? m.principalId.slice(0, 8)}</option>
              ))}
            </select>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Linked issue</label>
            <select value={issueId} onChange={(e) => setIssueId(e.target.value)} className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none">
              <option value="">None</option>
              {issues.filter((i: any) => !i.status || i.status === "backlog" || i.status === "todo").map((i) => <option key={i.id} value={i.id}>{i.identifier ? `${i.identifier} - ` : ""}{i.title}</option>)}
            </select>
          </div>
        </>
      )}

      {step.stepType === "if_else" && (
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground">Branches</label>
          {branches.map((branch, idx) => (
            <div key={branch.id} className="border border-border rounded p-2 space-y-2">
              <input type="text" value={branch.label} onChange={(e) => {
                const next = [...branches]; next[idx] = { ...next[idx], label: e.target.value }; setBranches(next);
              }} className="w-full text-sm bg-background border border-border rounded px-2 py-1 outline-none" placeholder="Branch label" />
              {branch.condition !== null ? (
                <div className="space-y-1.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Field</span>
                    <select value={branch.condition.field} onChange={(e) => {
                      const next = [...branches]; next[idx] = { ...next[idx], condition: { ...branch.condition!, field: e.target.value } }; setBranches(next);
                    }} className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none">
                      {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Operator</span>
                    <select value={branch.condition.operator} onChange={(e) => {
                      const next = [...branches]; next[idx] = { ...next[idx], condition: { ...branch.condition!, operator: e.target.value } }; setBranches(next);
                    }} className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none">
                      {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Value</span>
                    <input value={branch.condition.value} onChange={(e) => {
                      const next = [...branches]; next[idx] = { ...next[idx], condition: { ...branch.condition!, value: e.target.value } }; setBranches(next);
                    }} className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 outline-none" placeholder="value" />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Else (default branch)</span>
              )}
              <div>
                <span className="text-[10px] text-muted-foreground">Next steps:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {otherSteps.map((s) => (
                    <button key={s.id} onClick={() => {
                      const next = [...branches];
                      const ids = next[idx].nextStepIds.includes(s.id)
                        ? next[idx].nextStepIds.filter((id) => id !== s.id)
                        : [...next[idx].nextStepIds, s.id];
                      next[idx] = { ...next[idx], nextStepIds: ids }; setBranches(next);
                    }} className={`text-[10px] px-1.5 py-0.5 rounded border ${branch.nextStepIds.includes(s.id) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent"}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={!name.trim()}>Save</Button>
    </div>
  );
}
