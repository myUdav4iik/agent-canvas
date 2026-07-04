import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dbNodeToRF, dbEdgeToRF } from "@/lib/flow-convert";
import type { SaveNodePayload, SaveEdgePayload, AgentNodeData, TaskNodeData } from "@/lib/flow-convert";

type Params = { params: Promise<{ id: string }> };

// ─── GET /api/flows/[id] ─────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const flow = await prisma.flow.findUnique({
    where: { id },
    include: {
      nodes: true,
      edges: true,
    },
  });

  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hydrate agent + task data for each node
  const agentIds = flow.nodes.map((n) => n.agentId).filter(Boolean) as string[];
  const taskIds = flow.nodes.map((n) => n.taskId).filter(Boolean) as string[];

  const [agents, tasks, agentTools] = await Promise.all([
    agentIds.length > 0 ? prisma.agent.findMany({ where: { id: { in: agentIds } } }) : [],
    taskIds.length > 0 ? prisma.task.findMany({ where: { id: { in: taskIds } } }) : [],
    agentIds.length > 0
      ? prisma.agentTool.findMany({ where: { agentId: { in: agentIds } }, include: { tool: true } })
      : [],
  ]);

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]));
  const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]));
  // Build agentId → tool name list
  const agentToolsMap: Record<string, string[]> = {};
  for (const at of agentTools) {
    (agentToolsMap[at.agentId] ??= []).push(at.tool.name);
  }

  const rfNodes = flow.nodes.map((n) =>
    dbNodeToRF(
      n,
      n.agentId ? agentMap[n.agentId] : null,
      n.taskId ? taskMap[n.taskId] : null,
      n.agentId ? (agentToolsMap[n.agentId] ?? []) : [],
    ),
  );
  const rfEdges = flow.edges.map(dbEdgeToRF);

  return NextResponse.json({
    id: flow.id,
    name: flow.name,
    description: flow.description,
    nodes: rfNodes,
    edges: rfEdges,
  });
}

// ─── PUT /api/flows/[id] ─────────────────────────────────────────────────────

interface SaveFlowBody {
  name?: string;
  description?: string;
  nodes: SaveNodePayload[];
  edges: SaveEdgePayload[];
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;

  let body: SaveFlowBody;
  try {
    body = (await req.json()) as SaveFlowBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build rfId → db nodeId map (for edges, whose source/target are rfIds)
  const rfIdToDbId: Record<string, string> = {};

  try {
  await prisma.$transaction(async (tx) => {
    // 1. Update flow name/description
    await tx.flow.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });

    // 2. Delete all existing nodes + edges (cascade deletes edges too)
    await tx.flowEdge.deleteMany({ where: { flowId: id } });
    await tx.flowNode.deleteMany({ where: { flowId: id } });

    // 3. Upsert agent + task records; create flow nodes
    for (const node of body.nodes) {
      let agentId: string | null = null;
      let taskId: string | null = null;

      if (node.type === "agent" && node.agentData) {
        const d = node.agentData as AgentNodeData;
        const agentRecord = d.agentId
          ? await tx.agent.update({
              where: { id: d.agentId },
              data: {
                name: d.name,
                role: d.role,
                goal: d.goal,
                backstory: d.backstory,
                llmProvider: d.llmProvider,
                llmModel: d.llmModel,
                llmParams: JSON.stringify({ temperature: d.temperature, maxTokens: d.maxTokens }),
                memoryScope: JSON.stringify(d.memoryScope),
                maxIterations: d.maxIterations,
                allowDelegation: d.allowDelegation,
                verbose: d.verbose,
              },
            })
          : await tx.agent.create({
              data: {
                name: d.name || "Unnamed Agent",
                role: d.role || "Assistant",
                goal: d.goal || "",
                backstory: d.backstory || "",
                llmProvider: d.llmProvider || "claude-cli",
                llmModel: d.llmModel || "sonnet",
                llmParams: JSON.stringify({ temperature: d.temperature ?? 0.3, maxTokens: d.maxTokens ?? 2048 }),
                memoryScope: JSON.stringify(d.memoryScope ?? []),
                maxIterations: d.maxIterations ?? 8,
                allowDelegation: d.allowDelegation ?? false,
                verbose: d.verbose ?? false,
              },
            });
        agentId = agentRecord.id;

        // Sync tool assignments
        if (d.tools && d.tools.length > 0) {
          const toolRecords = await tx.tool.findMany({ where: { name: { in: d.tools } } });
          await tx.agentTool.deleteMany({ where: { agentId: agentRecord.id } });
          if (toolRecords.length > 0) {
            for (const t of toolRecords) {
              await tx.agentTool.upsert({
                where: { agentId_toolId: { agentId: agentRecord.id, toolId: t.id } },
                update: {},
                create: { agentId: agentRecord.id, toolId: t.id },
              });
            }
          }
        } else {
          await tx.agentTool.deleteMany({ where: { agentId: agentRecord.id } });
        }
      }

      if (node.type === "task" && node.taskData) {
        const d = node.taskData as TaskNodeData;
        const taskRecord = d.taskId
          ? await tx.task.update({
              where: { id: d.taskId },
              data: {
                description: d.description,
                expectedOutput: d.expectedOutput,
                outputFormat: d.outputFormat,
                humanInTheLoop: d.humanInTheLoop,
                contextTaskIds: JSON.stringify(d.contextTaskIds),
                assignedAgentId: d.assignedAgentId ?? null,
              },
            })
          : await tx.task.create({
              data: {
                description: d.description || "",
                expectedOutput: d.expectedOutput || "",
                outputFormat: d.outputFormat || "text",
                humanInTheLoop: d.humanInTheLoop ?? false,
                contextTaskIds: JSON.stringify(d.contextTaskIds ?? []),
                assignedAgentId: d.assignedAgentId ?? null,
              },
            });
        taskId = taskRecord.id;
        // Also store on the FlowNode so the agent is found via both lookup paths
        if (d.assignedAgentId) agentId = d.assignedAgentId;
      }

      const dbNode = await tx.flowNode.create({
        data: {
          flowId: id,
          type: node.type,
          positionX: node.positionX,
          positionY: node.positionY,
          label: node.label,
          agentId,
          taskId,
          loopType: node.loopType ?? null,
          loopMax: node.loopMax ?? null,
          loopCondition: node.loopCondition ?? null,
          conditionExpr: node.conditionExpr ?? null,
          parallelBranchCount: node.parallelBranchCount ?? null,
        },
      });

      rfIdToDbId[node.rfId] = dbNode.id;
    }

    // 4. Create edges (now that all node DB IDs are known)
    for (const edge of body.edges) {
      const sourceNodeId = rfIdToDbId[edge.sourceRfId];
      const targetNodeId = rfIdToDbId[edge.targetRfId];
      if (!sourceNodeId || !targetNodeId) continue;

      await tx.flowEdge.create({
        data: {
          flowId: id,
          sourceNodeId,
          targetNodeId,
          type: edge.type,
          label: edge.label,
          condition: edge.condition ?? null,
        },
      });
    }
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Return the updated flow so the client can sync new DB IDs into its canvas store
  try {
    return await GET(req, { params: Promise.resolve({ id }) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/flows/[id] ──────────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.flow.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
