import { NextRequest, NextResponse } from "next/server";
import { resumeRun } from "@/lib/engine-client";
import type { HumanDecision } from "@agent-company/engine";

type Params = { params: Promise<{ runId: string }> };

/** POST /api/runs/[runId]/resume — resolve a human-in-the-loop pause */
export async function POST(req: NextRequest, { params }: Params) {
  const { runId } = await params;
  const body = await req.json().catch(() => ({})) as {
    taskId?: string;
    decision?: HumanDecision["decision"];
    editedOutput?: string;
  };

  if (!body.taskId || !body.decision) {
    return NextResponse.json({ error: "taskId and decision are required" }, { status: 400 });
  }

  const resolved = resumeRun(runId, body.taskId, {
    decision: body.decision,
    ...(body.editedOutput !== undefined ? { editedOutput: body.editedOutput } : {}),
  });

  if (!resolved) {
    return NextResponse.json(
      { error: "No pending human-in-the-loop pause for this run/task" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
