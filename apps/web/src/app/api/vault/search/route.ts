import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** GET /api/vault/search?q=&tag= — full-text + tag search */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const tag = searchParams.get("tag")?.trim() ?? "";

  try {
    const all = await prisma.vaultNote.findMany({
      select: { id: true, path: true, title: true, tags: true, body: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    let results = all;

    if (tag) {
      results = results.filter((n) => {
        const tags = JSON.parse(n.tags) as string[];
        return tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()));
      });
    }

    if (q) {
      const lower = q.toLowerCase();
      results = results.filter(
        (n) =>
          n.title.toLowerCase().includes(lower) ||
          n.body.toLowerCase().includes(lower),
      );
    }

    // Return with match snippets
    const hits = results.slice(0, 30).map((n) => {
      let snippet = "";
      if (q) {
        const lower = q.toLowerCase();
        const idx = n.body.toLowerCase().indexOf(lower);
        if (idx !== -1) {
          const start = Math.max(0, idx - 60);
          const end = Math.min(n.body.length, idx + q.length + 120);
          snippet = (start > 0 ? "…" : "") + n.body.slice(start, end) + (end < n.body.length ? "…" : "");
        }
      }
      return {
        path: n.path,
        title: n.title,
        tags: JSON.parse(n.tags) as string[],
        snippet,
        updatedAt: n.updatedAt,
      };
    });

    return NextResponse.json({ hits, total: results.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
