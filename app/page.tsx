"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeciesOption = {
  key: string;
  label: string;
  scientificName: string;
  ensemblId: string;
};

const DEFAULT_SPECIES: SpeciesOption[] = [
  { key: "mouse", label: "Mouse", scientificName: "Mus musculus", ensemblId: "mus_musculus" },
  { key: "rat", label: "Rat", scientificName: "Rattus norvegicus", ensemblId: "rattus_norvegicus" },
  { key: "chimpanzee", label: "Chimpanzee", scientificName: "Pan troglodytes", ensemblId: "pan_troglodytes" },
  { key: "rhesus_macaque", label: "Rhesus macaque", scientificName: "Macaca mulatta", ensemblId: "macaca_mulatta" },
  { key: "chicken", label: "Chicken", scientificName: "Gallus gallus", ensemblId: "gallus_gallus" },
  { key: "anole_lizard", label: "Anole lizard", scientificName: "Anolis carolinensis", ensemblId: "anolis_carolinensis" },
  { key: "xenopus_tropicalis", label: "Xenopus tropicalis", scientificName: "Xenopus tropicalis", ensemblId: "xenopus_tropicalis" },
  { key: "spotted_gar", label: "Spotted gar", scientificName: "Lepisosteus oculatus", ensemblId: "lepisosteus_oculatus" },
  { key: "coelacanth", label: "Coelacanth", scientificName: "Latimeria chalumnae", ensemblId: "latimeria_chalumnae" },
];

type RunResponse = {
  jobId: string;
  fasta: string;
  records: Array<{
    fastaId: string;
    label: string;
    scientificName: string;
    ensemblId: string;
    length: number;
    homologyType?: string;
    percentIdentity?: number;
    targetGeneId?: string;
    targetProteinId?: string;
    selectionReason?: string;
    sourceAnnotation?: string;
  }>;
  missing: string[];
  resolvedQuery: {
    input: string;
    geneId: string;
    symbol: string;
    description?: string;
    matchedBy: string;
  };
};

type IdentityRow = {
  species: string;
  identity: number;
  comparedResidues: number;
  matches: number;
};

type ResultResponse = {
  alignment: string;
  parsed: Record<string, string>;
  identity: IdentityRow[];
};

type Phase = "idle" | "fetching" | "polling" | "done" | "error";

export default function Page() {
  const [gene, setGene] = useState("TP53");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(DEFAULT_SPECIES.map((s) => s.ensemblId)),
  );
  const [signalMode, setSignalMode] = useState<"include" | "trim">("include");
  const [email, setEmail] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [statusText, setStatusText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [runData, setRunData] = useState<RunResponse | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const toggleSpecies = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(DEFAULT_SPECIES.map((s) => s.ensemblId)));
  }, []);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const pollStatus = useCallback(
    async (jobId: string, attempt = 0) => {
      if (cancelled.current) return;
      try {
        const r = await fetch(`/api/status?jobId=${encodeURIComponent(jobId)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Status check failed");

        const status: string = j.status;
        setStatusText(`Clustal Omega: ${status} (check ${attempt + 1})`);

        if (status === "FINISHED") {
          const rr = await fetch(`/api/result?jobId=${encodeURIComponent(jobId)}`);
          const jj = await rr.json();
          if (!rr.ok) throw new Error(jj?.error || "Result fetch failed");
          setResult(jj);
          setPhase("done");
          setStatusText("Alignment complete.");
          return;
        }

        if (status === "ERROR" || status === "FAILURE" || status === "NOT_FOUND") {
          throw new Error(`Clustal Omega job ${status}`);
        }

        // Backoff: 3s → 5s → 8s, capped
        const delay = Math.min(3000 + attempt * 1500, 8000);
        pollTimer.current = setTimeout(() => pollStatus(jobId, attempt + 1), delay);
      } catch (e: any) {
        if (cancelled.current) return;
        setErrorMsg(e?.message || String(e));
        setPhase("error");
      }
    },
    [],
  );

  const onSubmit = useCallback(async () => {
    cancelled.current = false;
    setErrorMsg("");
    setResult(null);
    setRunData(null);
    setStatusText("Resolving gene and fetching orthologs…");
    setPhase("fetching");

    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gene: gene.trim(),
          species: [...selected],
          signalPeptideMode: signalMode,
          email: email.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Run failed");

      setRunData(j);
      setPhase("polling");
      setStatusText("Job submitted. Awaiting Clustal Omega…");
      pollStatus(j.jobId, 0);
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setPhase("error");
    }
  }, [gene, selected, signalMode, email, pollStatus]);

  const onReset = useCallback(() => {
    cancelled.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setPhase("idle");
    setStatusText("");
    setErrorMsg("");
    setResult(null);
    setRunData(null);
  }, []);

  const busy = phase === "fetching" || phase === "polling";

  const downloadFasta = useCallback(() => {
    if (!runData) return;
    const blob = new Blob([runData.fasta], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runData.resolvedQuery.symbol}_orthologs.fasta`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runData]);

  const downloadAlignment = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.alignment], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runData?.resolvedQuery.symbol ?? "alignment"}_clustal.aln`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, runData]);

  const annotatedAlignment = useMemo(() => {
    if (!result) return null;
    return renderAlignment(result.parsed);
  }, [result]);

  return (
    <main className="max-w-5xl mx-auto px-6 sm:px-10 py-12 sm:py-16">
      {/* Masthead */}
      <header className="mb-12 sm:mb-16">
        <div className="flex items-baseline justify-between gap-4 mb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
            Vol. I · No. 1 · Vertebrate Proteome
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted hidden sm:block">
            Ensembl × EBI Clustal Omega
          </p>
        </div>
        <div className="rule-line mb-6"></div>
        <h1 className="font-display font-medium text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] tracking-tightest text-balance">
          The Orthologue.
        </h1>
        <p className="font-display italic text-lg sm:text-xl text-muted mt-3 max-w-2xl">
          A reading room for protein conservation — fetch orthologous sequences
          from across the vertebrate tree and inspect their alignment.
        </p>
        <div className="rule-line mt-8"></div>
      </header>

      {/* Form */}
      <section className="mb-12">
        <SectionHeader number="01" title="Query" />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-8">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
              Human gene symbol or Ensembl ID
            </label>
            <input
              type="text"
              value={gene}
              onChange={(e) => setGene(e.target.value)}
              disabled={busy}
              placeholder="e.g. TP53, BRCA1, ENSG00000141510"
              className="w-full font-display text-2xl sm:text-3xl bg-transparent border-0 border-b-2 border-ink/30 focus:border-accent focus:outline-none pb-2 transition-colors disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col justify-end">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
              Signal peptide
            </label>
            <div className="flex gap-0 border border-ink/20 rounded-none">
              {(["include", "trim"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSignalMode(mode)}
                  disabled={busy}
                  className={`flex-1 px-4 py-3 font-mono text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
                    signalMode === mode
                      ? "bg-ink text-paper"
                      : "bg-transparent hover:bg-ink/5"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionHeader number="02" title="Target species" />
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted">
            {selected.size} of {DEFAULT_SPECIES.length} selected
          </p>
          <div className="flex gap-3 font-mono text-[11px] uppercase tracking-wider">
            <button
              type="button"
              onClick={selectAll}
              disabled={busy}
              className="text-accent hover:underline disabled:opacity-50"
            >
              All
            </button>
            <span className="text-muted">·</span>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              className="text-accent hover:underline disabled:opacity-50"
            >
              None
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-rule mb-8">
          {DEFAULT_SPECIES.map((sp) => {
            const isOn = selected.has(sp.ensemblId);
            return (
              <button
                key={sp.ensemblId}
                type="button"
                onClick={() => toggleSpecies(sp.ensemblId)}
                disabled={busy}
                className={`text-left p-4 transition-colors disabled:opacity-50 ${
                  isOn ? "bg-accent-soft" : "bg-paper hover:bg-ink/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-medium">{sp.label}</div>
                    <div className="font-display italic text-sm text-muted">
                      {sp.scientificName}
                    </div>
                  </div>
                  <span
                    className={`mt-1 w-4 h-4 border-2 flex items-center justify-center text-xs ${
                      isOn ? "bg-accent border-accent text-paper" : "border-ink/30"
                    }`}
                  >
                    {isOn ? "✓" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <SectionHeader number="03" title="Contact (optional)" />
        <div className="mb-8">
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
            Email for EBI Clustal Omega job
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="you@institution.edu"
            className="w-full sm:w-96 font-mono text-sm bg-transparent border-0 border-b border-ink/30 focus:border-accent focus:outline-none pb-2 transition-colors disabled:opacity-50"
          />
          <p className="text-xs text-muted mt-2">
            Used only to identify your job with EBI. Anonymous if left blank.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-4 mt-8">
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !gene.trim() || selected.size === 0}
            className="px-8 py-4 bg-accent text-paper font-mono uppercase tracking-[0.15em] text-sm hover:bg-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Running…" : "Run Alignment"}
          </button>
          {(phase !== "idle") && (
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              className="px-6 py-4 border border-ink/30 font-mono uppercase tracking-[0.15em] text-xs hover:bg-ink/5 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
          )}
          {statusText && (
            <span className="font-mono text-xs text-muted inline-flex items-center gap-2">
              {busy && <span className="w-2 h-2 rounded-full bg-accent pulse-dot inline-block" />}
              {statusText}
            </span>
          )}
        </div>

        {errorMsg && (
          <div className="mt-6 p-4 border-l-4 border-crimson bg-crimson/5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-crimson mb-1">
              Error
            </p>
            <p className="text-sm text-ink">{errorMsg}</p>
          </div>
        )}
      </section>

      {/* Results */}
      {runData && (
        <section className="mb-12">
          <div className="rule-line mb-8"></div>
          <SectionHeader number="04" title="Resolved gene" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <Field label="Symbol">{runData.resolvedQuery.symbol}</Field>
            <Field label="Ensembl ID" mono>
              {runData.resolvedQuery.geneId}
            </Field>
            <Field label="Matched by">{runData.resolvedQuery.matchedBy}</Field>
          </div>
          {runData.resolvedQuery.description && (
            <p className="font-display italic text-muted mb-8 max-w-3xl">
              {runData.resolvedQuery.description}
            </p>
          )}

          <SectionHeader number="05" title="Retrieved sequences" />
          <div className="overflow-x-auto scrollbar-thin mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/30">
                  <th className="text-left font-mono text-[10px] uppercase tracking-wider text-muted py-2 pr-4">
                    Species
                  </th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted py-2 px-4">
                    Length
                  </th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted py-2 px-4">
                    % ID
                  </th>
                  <th className="text-left font-mono text-[10px] uppercase tracking-wider text-muted py-2 pl-4">
                    Protein ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {runData.records.map((rec) => (
                  <tr key={rec.fastaId} className="border-b border-rule">
                    <td className="py-2 pr-4">
                      <span className="font-display">{rec.label || rec.scientificName}</span>
                      <span className="font-display italic text-muted ml-2">
                        {rec.scientificName}
                      </span>
                    </td>
                    <td className="text-right font-mono text-xs py-2 px-4">{rec.length}</td>
                    <td className="text-right font-mono text-xs py-2 px-4">
                      {typeof rec.percentIdentity === "number"
                        ? rec.percentIdentity.toFixed(1)
                        : "—"}
                    </td>
                    <td className="font-mono text-xs py-2 pl-4 text-muted">
                      {rec.targetProteinId || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {runData.missing.length > 0 && (
            <div className="mb-6 p-4 bg-warm/15 border-l-4 border-warm">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink mb-2">
                Missing orthologs ({runData.missing.length})
              </p>
              <ul className="text-sm space-y-1">
                {runData.missing.map((m) => (
                  <li key={m} className="font-display italic">{m}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={downloadFasta}
            className="font-mono text-xs uppercase tracking-wider text-accent hover:underline"
          >
            ↓ Download FASTA
          </button>
        </section>
      )}

      {result && annotatedAlignment && (
        <section className="mb-12">
          <div className="rule-line mb-8"></div>
          <SectionHeader number="06" title="Multiple sequence alignment" />
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Identical residues highlighted; columns of 60 per block.
            </p>
            <button
              type="button"
              onClick={downloadAlignment}
              className="font-mono text-xs uppercase tracking-wider text-accent hover:underline"
            >
              ↓ Download Clustal
            </button>
          </div>
          <div className="bg-ink text-paper p-6 overflow-x-auto scrollbar-thin font-mono text-[11px] leading-[1.5] mb-8">
            {annotatedAlignment}
          </div>

          <SectionHeader number="07" title="Identity vs human" />
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/30">
                  <th className="text-left font-mono text-[10px] uppercase tracking-wider text-muted py-2 pr-4">
                    Species
                  </th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted py-2 px-4">
                    Identity (%)
                  </th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted py-2 px-4">
                    Matches
                  </th>
                  <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted py-2 pl-4">
                    Compared
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.identity.map((row) => (
                  <tr key={row.species} className="border-b border-rule">
                    <td className="py-2 pr-4 font-display">{row.species}</td>
                    <td className="text-right py-2 px-4">
                      <span className="font-mono text-base">
                        {row.identity.toFixed(2)}
                      </span>
                      <span className="inline-block ml-3 w-24 h-1.5 bg-rule align-middle relative">
                        <span
                          className="absolute left-0 top-0 h-full bg-accent"
                          style={{ width: `${Math.max(0, Math.min(100, row.identity))}%` }}
                        />
                      </span>
                    </td>
                    <td className="text-right font-mono text-xs py-2 px-4 text-muted">
                      {row.matches}
                    </td>
                    <td className="text-right font-mono text-xs py-2 pl-4 text-muted">
                      {row.comparedResidues}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-rule">
        <div className="flex flex-col sm:flex-row justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>Data · Ensembl REST · BioMart · EBI Clustal Omega</span>
          <span>Built with Next.js · Deployed on Vercel</span>
        </div>
      </footer>
    </main>
  );
}

/* ---------- helpers ---------- */

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4 mb-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
        § {number}
      </span>
      <h2 className="font-display text-2xl font-medium">{title}</h2>
    </div>
  );
}

function Field({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-1">
        {label}
      </div>
      <div className={mono ? "font-mono text-sm" : "font-display text-lg"}>
        {children}
      </div>
    </div>
  );
}

function renderAlignment(parsed: Record<string, string>) {
  const ids = Object.keys(parsed);
  if (ids.length === 0) return null;
  const names = ids;
  const seqs = names.map((n) => parsed[n]);
  const maxLen = Math.max(...seqs.map((s) => s.length));
  const blockSize = 60;
  const labelWidth = Math.max(...names.map((n) => n.length)) + 2;

  // Pre-compute conservation per column (1.0 if all non-gap chars equal at that column)
  const conservation: boolean[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    let firstChar: string | null = null;
    let allMatch = true;
    let anyChar = false;
    for (const s of seqs) {
      const ch = s[i];
      if (!ch || ch === "-") continue;
      anyChar = true;
      if (firstChar === null) firstChar = ch;
      else if (ch !== firstChar) {
        allMatch = false;
        break;
      }
    }
    conservation.push(anyChar && allMatch);
  }

  const blocks: JSX.Element[] = [];
  for (let start = 0; start < maxLen; start += blockSize) {
    const end = Math.min(start + blockSize, maxLen);
    const rows = names.map((name, idx) => {
      const seq = seqs[idx];
      const slice = seq.slice(start, end);
      const chars = Array.from(slice).map((ch, j) => {
        const col = start + j;
        const isCons = conservation[col];
        return (
          <span
            key={j}
            className={isCons && ch !== "-" ? "text-warm font-semibold" : undefined}
          >
            {ch}
          </span>
        );
      });
      return (
        <div key={name + start} className="whitespace-pre">
          <span className="text-muted/70 inline-block" style={{ width: `${labelWidth}ch` }}>
            {name.padEnd(labelWidth)}
          </span>
          {chars}
        </div>
      );
    });
    blocks.push(
      <div key={start} className="mb-4">
        {rows}
        <div className="whitespace-pre text-muted/40">
          <span className="inline-block" style={{ width: `${labelWidth}ch` }}>
            {" ".repeat(labelWidth)}
          </span>
          {Array.from({ length: end - start }, (_, j) => {
            const col = start + j;
            return conservation[col] ? "*" : " ";
          }).join("")}
        </div>
      </div>,
    );
  }
  return <>{blocks}</>;
}
