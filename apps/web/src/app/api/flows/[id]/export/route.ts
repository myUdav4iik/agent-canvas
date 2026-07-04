import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/flows/[id]/export
 * Returns a self-contained JSON bundle of the flow + all referenced agents + tasks.
 * The bundle can be re-imported via POST /api/flows/import.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  const flow = await prisma.flow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agentIds = flow.nodes.map((n) => n.agentId).filter(Boolean) as string[];
  const taskIds  = flow.nodes.map((n) => n.taskId).filter(Boolean) as string[];

  const [agents, tasks, agentTools] = await Promise.all([
    agentIds.length > 0 ? prisma.agent.findMany({ where: { id: { in: agentIds } } }) : [],
    taskIds.length  > 0 ? prisma.task.findMany({ where: { id: { in: taskIds  } } }) : [],
    agentIds.length > 0
      ? prisma.agentTool.findMany({ where: { agentId: { in: agentIds } }, include: { tool: true } })
      : [],
  ]);

  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    flow: {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      nodes: flow.nodes,
      edges: flow.edges,
    },
    agents,
    tasks,
    agentTools: agentTools.map((at) => ({ agentId: at.agentId, tool: at.tool })),
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="flow-${flow.name.replace(/[^a-z0-9]/gi, "_")}-${id.slice(-6)}.json"`,
    },
  });
}
