import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "node:crypto";

/**
 * POST /api/flows/import
 * Body: the JSON bundle produced by GET /api/flows/[id]/export
 * Re-creates all entities with fresh IDs, preserving internal references.
 */
export async function POST(req: Request) {
  let bundle: {
    version: number;
    flow: {
      id: string;
      name: string;
      description: string;
      nodes: {
        id: string;
        flowId: string;
        type: string;
        positionX: number;
        positionY: number;
        label: string;
        agentId: string | null;
        taskId: string | null;
        loopType: string | null;
        loopMax: number | null;
        loopCondition: string | null;
        conditionExpr: string | null;
        parallelBranchCount: number | null;
      }[];
      edges: {
        id: string;
        flowId: string;
        sourceNodeId: string;
        targetNodeId: string;
        type: string;
        label: string;
        condition: string | null;
      }[];
    };
    agents: {
      id: string;
      name: string;
      role: string;
      goal: string;
      backstory: string;
      llmProvider: string;
      llmModel: string;
      llmParams: string;
      memoryScope: string;
      maxIterations: number;
      allowDelegation: boolean;
      verbose: boolean;
    }[];
    tasks: {
      id: string;
      description: string;
      expectedOutput: string;
      assignedAgentId: string | null;
      contextTaskIds: string;
      outputFormat: string;
      humanInTheLoop: boolean;
    }[];
    agentTools: {
      agentId: string;
      tool: {
        id: string;
        name: string;
        description: string;
        type: string;
        argsSchema: string;
        funcBody: string | null;
        httpEndpoint: string | null;
      };
    }[];
  };

  try {
    bundle = await req.json() as typeof bundle;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!bundle.flow || !Array.isArray(bundle.flow.nodes)) {
    return NextResponse.json({ error: "Invalid bundle format" }, { status: 400 });
  }

  // Build old→new ID maps
  const agentIdMap: Record<string, string> = {};
  const taskIdMap: Record<string, string> = {};
  const nodeIdMap: Record<string, string> = {};

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Create agents
      for (const agent of bundle.agents) {
        const newId = randomUUID();
        agentIdMap[agent.id] = newId;
        await tx.agent.create({
          data: {
            id: newId,
            name: agent.name,
            role: agent.role,
            goal: agent.goal,
            backstory: agent.backstory,
            llmProvider: agent.llmProvider,
            llmModel: agent.llmModel,
            llmParams: agent.llmParams,
            memoryScope: agent.memoryScope,
            maxIterations: agent.maxIterations,
            allowDelegation: agent.allowDelegation,
            verbose: agent.verbose,
          },
        });
      }

      // 2. Create tools + agent-tool links (upsert tools by name)
      for (const { agentId: oldAgentId, tool } of bundle.agentTools) {
        const newAgentId = agentIdMap[oldAgentId];
        if (!newAgentId) continue;

        const dbTool = await tx.tool.upsert({
          where: { id: tool.id },
          update: {},
          create: {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            type: tool.type,
            argsSchema: tool.argsSchema,
            funcBody: tool.funcBody ?? null,
            httpEndpoint: tool.httpEndpoint ?? null,
          },
        });

        await tx.agentTool.upsert({
          where: { agentId_toolId: { agentId: newAgentId, toolId: dbTool.id } },
          update: {},
          create: { agentId: newAgentId, toolId: dbTool.id },
        });
      }

      // 3. Create tasks (resolve assignedAgentId)
      for (const task of bundle.tasks) {
        const newId = randomUUID();
        taskIdMap[task.id] = newId;
        const newAgentId = task.assignedAgentId ? agentIdMap[task.assignedAgentId] : null;
        await tx.task.create({
          data: {
            id: newId,
            description: task.description,
            expectedOutput: task.expectedOutput,
            ...(newAgentId ? { assignedAgentId: newAgentId } : {}),
            contextTaskIds: task.contextTaskIds,
            outputFormat: task.outputFormat,
            humanInTheLoop: task.humanInTheLoop,
          },
        });
      }

      // 4. Create flow
      const newFlowId = randomUUID();
      await tx.flow.create({
        data: {
          id: newFlowId,
          name: `${bundle.flow.name} (imported)`,
          description: bundle.flow.description,
        },
      });

      // 5. Create nodes
      for (const node of bundle.flow.nodes) {
        const newNodeId = randomUUID();
        nodeIdMap[node.id] = newNodeId;
        const mappedAgentId = node.agentId ? (agentIdMap[node.agentId] ?? null) : null;
        const mappedTaskId  = node.taskId  ? (taskIdMap[node.taskId]   ?? null) : null;
        await tx.flowNode.create({
          data: {
            id: newNodeId,
            flowId: newFlowId,
            type: node.type,
            positionX: node.positionX,
            positionY: node.positionY,
            label: node.label,
            agentId: mappedAgentId,
            taskId: mappedTaskId,
            loopType: node.loopType ?? null,
            loopMax: node.loopMax ?? null,
            loopCondition: node.loopCondition ?? null,
            conditionExpr: node.conditionExpr ?? null,
            parallelBranchCount: node.parallelBranchCount ?? null,
          },
        });
      }

      // 6. Create edges
      for (const edge of bundle.flow.edges) {
        const srcId = nodeIdMap[edge.sourceNodeId];
        const tgtId = nodeIdMap[edge.targetNodeId];
        if (!srcId || !tgtId) continue;
        await tx.flowEdge.create({
          data: {
            flowId: newFlowId,
            sourceNodeId: srcId,
            targetNodeId: tgtId,
            type: edge.type,
            label: edge.label,
            condition: edge.condition ?? null,
          },
        });
      }

      // Return the new flow id
      (agentIdMap as Record<string, string>)["__newFlowId__"] = newFlowId;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ flowId: agentIdMap["__newFlowId__"] }, { status: 201 });
}
