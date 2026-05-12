import { NextResponse } from "next/server";
import { fetchOrthologs, submitClustalOmega } from "@/lib/msa";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  gene?: string;
  species?: string[];
  signalPeptideMode?: "include" | "trim";
  email?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const gene = (body.gene || "").trim();
  const species = Array.isArray(body.species) ? body.species.filter(Boolean) : [];
  const signalPeptideMode = body.signalPeptideMode === "trim" ? "trim" : "include";
  const email = (body.email || "").trim();

  if (!gene) {
    return NextResponse.json({ error: "gene is required" }, { status: 400 });
  }
  if (species.length === 0) {
    return NextResponse.json({ error: "at least one species is required" }, { status: 400 });
  }

  try {
    const result = await fetchOrthologs(gene, species, { signalPeptideMode });
    const jobId = await submitClustalOmega(result.fasta, email || "anonymous@example.com");

    return NextResponse.json({
      jobId,
      fasta: result.fasta,
      records: result.records.map((r) => ({
        fastaId: r.fastaId,
        label: r.label,
        scientificName: r.scientificName,
        ensemblId: r.ensemblId,
        length: r.length,
        homologyType: r.homologyType,
        percentIdentity: r.percentIdentity,
        targetGeneId: r.targetGeneId,
        targetProteinId: r.targetProteinId,
        selectionReason: r.selectionReason,
        sourceAnnotation: r.sourceAnnotation,
      })),
      missing: result.missing,
      resolvedQuery: result.resolvedQuery,
      signalPeptideMode: result.signalPeptideMode,
    });
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
