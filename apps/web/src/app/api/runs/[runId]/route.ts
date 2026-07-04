import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { killRun } from "@/lib/engine-client";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { runId } = await params;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      flow: { select: { id: true, name: true } },
      events: {
        orderBy: { sequence: "asc" },
        select: { sequence: true, eventType: true, payload: true, timestamp: true },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...run,
    events: run.events.map((e) => ({
      sequence: e.sequence,
      eventType: e.eventType,
      event: JSON.parse(e.payload) as unknown,
      timestamp: e.timestamp,
    })),
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { runId } = await params;
  killRun(runId);
  await prisma.run.update({
    where: { id: runId },
    data: { status: "killed", completedAt: new Date() },
  });
  return new Response(null, { status: 204 });
}
