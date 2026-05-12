import { NextResponse } from "next/server";
import {
  getClustalOmegaAlignment,
  parseClustal,
  summarizeIdentity,
} from "@/lib/msa";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const alignment = await getClustalOmegaAlignment(jobId);
    const parsed = parseClustal(alignment);
    const identity = summarizeIdentity(parsed, "human");
    return NextResponse.json({ alignment, parsed, identity });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 502 });
  }
}
