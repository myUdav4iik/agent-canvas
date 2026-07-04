import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const flows = await prisma.flow.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, updatedAt: true, createdAt: true },
  });
  return NextResponse.json(flows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { name?: string; description?: string };
  try {
    const flow = await prisma.flow.create({
      data: {
        name: body.name ?? "Untitled Flow",
        description: body.description ?? "",
      },
    });
    return NextResponse.json(flow, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
