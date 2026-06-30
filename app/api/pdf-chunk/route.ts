import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pdfChunks } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { uploadId, chunkIndex, totalChunks, data } = body as Record<string, unknown>;

  if (
    typeof uploadId !== "string" ||
    typeof chunkIndex !== "number" ||
    typeof totalChunks !== "number" ||
    typeof data !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields" }, { status: 400 });
  }

  await db
    .insert(pdfChunks)
    .values({ uploadId, chunkIndex, totalChunks, data })
    .onConflictDoNothing();

  // Opportunistically purge chunks older than 1 hour to prevent DB bloat.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  db.delete(pdfChunks).where(lt(pdfChunks.createdAt, oneHourAgo)).catch(() => null);

  return NextResponse.json({ ok: true });
}
