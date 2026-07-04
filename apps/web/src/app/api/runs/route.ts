import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runEngine } from "@/lib/engine-client";

export async function GET() {
  const runs = await prisma.run.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      flowId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
      totalTokens: true,
      totalCostUsd: true,
      flow: { select: { name: true } },
    },
  });
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { flowId?: string };
  if (!body.flowId) {
    return NextResponse.json({ error: "flowId required" }, { status: 400 });
  }

  const flow = await prisma.flow.findUnique({ where: { id: body.flowId } });
  if (!flow) {
    return NextResponse.json({ error: "Flow not found" }, { status: 404 });
  }

  const run = await prisma.run.create({
    data: { flowId: body.flowId, status: "running" },
  });

  // Fire-and-forget — engine runs asynchronously
  setImmediate(() => {
    runEngine(run.id, body.flowId!).catch((err: unknown) => {
      console.error(`[engine] run ${run.id} crashed:`, err);
    });
  });

  return NextResponse.json({ runId: run.id }, { status: 201 });
}
