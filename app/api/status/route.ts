import { NextResponse } from "next/server";
import { getClustalOmegaStatus } from "@/lib/msa";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const status = await getClustalOmegaStatus(jobId);
    return NextResponse.json({ jobId, status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 502 });
  }
}
