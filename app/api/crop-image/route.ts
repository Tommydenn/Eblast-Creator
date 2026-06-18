import { NextRequest, NextResponse } from "next/server";
import { cropDataUriToFocusAndRatio } from "@/lib/pdf-images";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { imageUrl: string; targetRatio: number; focus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.imageUrl || !body.targetRatio) {
    return NextResponse.json({ ok: false, error: "Missing imageUrl or targetRatio" }, { status: 400 });
  }

  const validFoci = ["top", "center", "bottom", "left", "right"] as const;
  type Focus = typeof validFoci[number];
  const focus: Focus = (validFoci as readonly string[]).includes(body.focus ?? "") ? body.focus as Focus : "center";

  try {
    const croppedUrl = await cropDataUriToFocusAndRatio(body.imageUrl, body.targetRatio, focus);
    return NextResponse.json({ ok: true, croppedUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
