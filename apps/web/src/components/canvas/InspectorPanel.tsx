"use client";
import { useCanvasStore } from "@/stores/canvas";
import { useResizable } from "@/hooks/useResizable";
import type {
  AgentNodeData, TaskNodeData, LoopNodeData, ConditionNodeData,
} from "@/lib/flow-convert";

// Shared form primitives
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3d5070]">{label}</span>
      {children}
    </label>
  );
}

const inputCls = [
  "rounded-md border border-[#1e2a40] bg-[#141c2e]",
  "px-2.5 py-1.5 text-[12px] text-[#e2e8f4]",
  "outline-none focus:border-blue-500/50 focus:bg-[#141c2e]",
  "placeholder:text-[#3d5070] transition-colors",
].join(" ");
const textareaCls = `${inputCls} resize-none leading-relaxed`;
const selectCls = `${inputCls} cursor-pointer`;

const MODEL_SUGGESTIONS = {
  "claude-cli": ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  anthropic:    ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  openai:       ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  ollama:       ["llama3.3", "mistral", "gemma3", "phi4", "qwen2.5"],
} as const;

// ─── Per-type inspector forms ─────────────────────────────────────────────────

function AgentInspector({ nodeId, data }: { nodeId: string; data: AgentNodeData }) {
  const update = useCanvasStore((s) => s.updateNodeData);
  const u = (patch: Partial<AgentNodeData>) => update(nodeId, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Name">
        <input className={inputCls} value={data.name} onChange={(e) => u({ name: e.target.value, label: e.target.value })} placeholder="Agent name" />
      </Field>
      <Field label="Role">
        <input className={inputCls} value={data.role} onChange={(e) => u({ role: e.target.value })} placeholder="e.g. Research Specialist" />
      </Field>
      <Field label="Goal">
        <textarea className={textareaCls} rows={2} value={data.goal} onChange={(e) => u({ goal: e.target.value })} placeholder="What this agent aims to achieve" />
      </Field>
      <Field label="Backstory">
        <textarea className={textareaCls} rows={3} value={data.backstory} onChange={(e) => u({ backstory: e.target.value })} placeholder="Background and expertise" />
      </Field>
      <Field label="LLM Provider">
        <select className={selectCls} value={data.llmProvider} onChange={(e) => u({ llmProvider: e.target.value })}>
          <option value="claude-cli">Claude CLI (local)</option>
          <option value="anthropic">Anthropic SDK</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
        </select>
      </Field>
      <Field label="Model">
        <input
          className={inputCls}
          list={`model-suggestions-${nodeId}`}
          value={data.llmModel}
          onChange={(e) => u({ llmModel: e.target.value })}
          placeholder="e.g. claude-sonnet-4-6"
        />
        <datalist id={`model-suggestions-${nodeId}`}>
          {MODEL_SUGGESTIONS[data.llmProvider as keyof typeof MODEL_SUGGESTIONS]?.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label="Temperature">
        <input type="range" min={0} max={1} step={0.05} value={data.temperature} onChange={(e) => u({ temperature: parseFloat(e.target.value) })} className="accent-blue-500 w-full" />
        <span className="text-[10px] text-[#3d5070]">{data.temperature}</span>
      </Field>
      <Field label="Max Iterations">
        <input type="number" className={inputCls} min={1} max={50} value={data.maxIterations} onChange={(e) => u({ maxIterations: parseInt(e.target.value) || 8 })} />
      </Field>
      <Field label="Tools (comma-separated)">
        <input className={inputCls} value={data.tools.join(", ")} onChange={(e) => u({ tools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="calculator, web_search, vault_read" />
      </Field>
      <label className="flex items-center gap-2 text-[12px] text-[#7d92ad] cursor-pointer">
        <input type="checkbox" className="accent-blue-500 rounded" checked={data.allowDelegation} onChange={(e) => u({ allowDelegation: e.target.checked })} />
        Allow delegation to subagents
      </label>
    </div>
  );
}

function TaskInspector({ nodeId, data }: { nodeId: string; data: TaskNodeData }) {
  const update = useCanvasStore((s) => s.updateNodeData);
  const nodes = useCanvasStore((s) => s.nodes);
  const u = (patch: Partial<TaskNodeData>) => update(nodeId, patch);

  // Collect agent nodes that have been saved (have a DB agentId)
  const agentOptions = nodes
    .filter((n) => n.type === "agent")
    .map((n) => {
      const d = n.data as import("@/lib/flow-convert").AgentNodeData;
      return { id: n.id, agentId: d.agentId, name: d.name || d.label || "Unnamed Agent" };
    });

  return (
    <div className="flex flex-col gap-3">
      <Field label="Label">
        <input className={inputCls} value={data.label} onChange={(e) => u({ label: e.target.value })} placeholder="Task label" />
      </Field>
      <Field label="Assigned Agent">
        <select
          className={selectCls}
          value={data.assignedAgentId ?? ""}
          onChange={(e) => { const v = e.target.value; v ? u({ assignedAgentId: v }) : update(nodeId, { ...data, assignedAgentId: undefined }); }}
        >
          <option value="">— pick an agent —</option>
          {agentOptions.map((a) => (
            <option key={a.id} value={a.agentId ?? a.id} disabled={!a.agentId}>
              {a.name}{!a.agentId ? " (save flow first)" : ""}
            </option>
          ))}
        </select>
        {agentOptions.length === 0 && (
          <p className="text-[10px] text-amber-600">Add an Agent node to the canvas first</p>
        )}
      </Field>
      <Field label="Description">
        <textarea className={textareaCls} rows={4} value={data.description} onChange={(e) => u({ description: e.target.value })} placeholder="What the agent should do" />
      </Field>
      <Field label="Expected Output">
        <textarea className={textareaCls} rows={3} value={data.expectedOutput} onChange={(e) => u({ expectedOutput: e.target.value })} placeholder="What the output should look like" />
      </Field>
      <Field label="Output Format">
        <select className={selectCls} value={data.outputFormat} onChange={(e) => u({ outputFormat: e.target.value as TaskNodeData["outputFormat"] })}>
          <option value="text">Text</option>
          <option value="json">JSON</option>
          <option value="markdown-note">Markdown Note (vault)</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-[12px] text-[#7d92ad] cursor-pointer">
        <input type="checkbox" className="accent-amber-500 rounded" checked={data.humanInTheLoop} onChange={(e) => u({ humanInTheLoop: e.target.checked })} />
        Pause for human review
      </label>
    </div>
  );
}

function LoopInspector({ nodeId, data }: { nodeId: string; data: LoopNodeData }) {
  const update = useCanvasStore((s) => s.updateNodeData);
  const u = (patch: Partial<LoopNodeData>) => update(nodeId, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Label">
        <input className={inputCls} value={data.label} onChange={(e) => u({ label: e.target.value })} />
      </Field>
      <Field label="Loop Type">
        <select className={selectCls} value={data.loopType} onChange={(e) => u({ loopType: e.target.value as LoopNodeData["loopType"] })}>
          <option value="fixed-n">Fixed N iterations</option>
          <option value="while">While condition is true</option>
          <option value="until">Until condition is true</option>
          <option value="for-each">For each item in output</option>
        </select>
      </Field>
      <Field label="Max Iterations (hard cap)">
        <input type="number" className={inputCls} min={1} max={100} value={data.loopMax} onChange={(e) => u({ loopMax: parseInt(e.target.value) || 3 })} />
      </Field>
      {data.loopType !== "fixed-n" && (
        <Field label="Break Condition (JS expression)">
          <textarea className={`${textareaCls} font-mono`} rows={2} value={data.loopCondition} onChange={(e) => u({ loopCondition: e.target.value })} placeholder="e.g. state.score >= 7" />
        </Field>
      )}
    </div>
  );
}

function ConditionInspector({ nodeId, data }: { nodeId: string; data: ConditionNodeData }) {
  const update = useCanvasStore((s) => s.updateNodeData);
  const u = (patch: Partial<ConditionNodeData>) => update(nodeId, patch);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Label">
        <input className={inputCls} value={data.label} onChange={(e) => u({ label: e.target.value })} />
      </Field>
      <Field label="Condition Expression (JS)">
        <textarea className={`${textareaCls} font-mono`} rows={3} value={data.conditionExpr} onChange={(e) => u({ conditionExpr: e.target.value })} placeholder='e.g. Number(outputs.score) >= 7' />
      </Field>
      <p className="text-[10px] text-[#3d5070] leading-relaxed">
        Evaluated with <code className="text-[#7d92ad] font-mono">state</code> and <code className="text-[#7d92ad] font-mono">outputs</code>. True → right, False → bottom.
      </p>
    </div>
  );
}

// ─── Main inspector shell ─────────────────────────────────────────────────────

export function InspectorPanel() {
  const { nodes, selectedNodeId, removeNode } = useCanvasStore();
  const selected = nodes.find((n) => n.id === selectedNodeId);
  const { width, handleProps } = useResizable({ defaultWidth: 256, minWidth: 180, maxWidth: 520, direction: "left" });

  if (!selected) {
    return (
      <aside
        className="relative flex flex-col flex-shrink-0 items-center justify-center gap-2 border-l border-[#131c30] bg-[#0d1420] p-4 text-center"
        style={{ width }}
      >
        <div {...handleProps} className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/25" />
        <p className="text-[11px] text-[#3d5070]">Select a node to edit</p>
      </aside>
    );
  }

  const type = selected.type ?? "";
  const data = selected.data as Record<string, unknown>;

  const typeLabel: Record<string, string> = {
    agent: "Agent", task: "Task", loop: "Loop", condition: "Condition",
    parallel: "Parallel", join: "Join", start: "Start", end: "End",
  };

  return (
    <aside className="relative flex flex-shrink-0 flex-col border-l border-[#131c30] bg-[#0d1420]" style={{ width }}>
      <div {...handleProps} className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/25" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#131c30] px-3 py-2">
        <span className="text-[11px] font-semibold text-[#7d92ad]">{typeLabel[type] ?? type}</span>
        <button
          onClick={() => removeNode(selected.id)}
          className="rounded-md p-1 text-[#3d5070] hover:bg-red-950/50 hover:text-red-400 transition-colors"
          title="Delete node"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
          </svg>
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto p-3">
        {type === "agent" && <AgentInspector nodeId={selected.id} data={data as AgentNodeData} />}
        {type === "task"  && <TaskInspector  nodeId={selected.id} data={data as TaskNodeData} />}
        {type === "loop"  && <LoopInspector  nodeId={selected.id} data={data as LoopNodeData} />}
        {type === "condition" && <ConditionInspector nodeId={selected.id} data={data as ConditionNodeData} />}
        {["start","end","parallel","join"].includes(type) && (
          <div className="flex flex-col gap-3">
            <Field label="Label">
              <input className={inputCls} value={(data["label"] as string) ?? ""} onChange={(e) => useCanvasStore.getState().updateNodeData(selected.id, { label: e.target.value })} />
            </Field>
          </div>
        )}
      </div>

      {/* Node ID debug footer */}
      <div className="border-t border-[#131c30] px-3 py-1.5">
        <p className="font-mono text-[9px] text-[#1e2a40] truncate">{selected.id}</p>
      </div>
    </aside>
  );
}
