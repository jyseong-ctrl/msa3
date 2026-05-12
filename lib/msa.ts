export type SpeciesInfo = {
  key: string;
  label: string;
  scientificName: string;
  ensemblId: string;
  commonName?: string;
  division?: string;
  assembly?: string;
  release?: string | number;
  taxonId?: string | number;
  aliases?: string[];
};

export type SequenceRecord = SpeciesInfo & {
  fastaId: string;
  sequence: string;
  length: number;
  fullLength?: number;
  homologyType?: string;
  percentIdentity?: number;
  selectionReason?: string;
  targetGeneId?: string;
  targetProteinId?: string;
  sourceAnnotation?: string;
  signalPeptide?: SignalPeptideFeature;
  signalPeptideRemoved?: boolean;
};

export type SignalPeptideMode = "include" | "trim";

export type SignalPeptideFeature = {
  start: number;
  end: number;
  type?: string;
  description?: string;
};

export type HumanGeneSuggestion = {
  geneId: string;
  symbol: string;
  description?: string;
  biotype?: string;
  matchedBy: "symbol" | "ensembl_id" | "description";
};

export type HumanQueryResolution = {
  input: string;
  geneId: string;
  symbol: string;
  description?: string;
  matchedBy: string;
};

export type IdentityRecord = {
  species: string;
  identity: number;
  comparedResidues: number;
  matches: number;
};

export type ClustalStatus = "PENDING" | "RUNNING" | "FINISHED" | "ERROR" | "FAILURE" | "NOT_FOUND";

type HomologySide = {
  align_seq?: string;
  seq?: string;
  sequence?: string;
  id?: string;
  protein_id?: string;
  species?: string;
  perc_id?: number;
};

type HomologyRecord = {
  type?: string;
  source?: HomologySide;
  target?: HomologySide;
};

type LookupRecord = {
  id?: string;
  object_type?: string;
  Parent?: string;
  display_name?: string;
  description?: string;
  species?: string;
};

type TranslationLookupRecord = {
  id?: string;
  length?: number;
};

type TranscriptLookupRecord = LookupRecord & {
  source?: string;
  biotype?: string;
  is_canonical?: number | boolean;
  gencode_primary?: number | boolean;
  Translation?: TranslationLookupRecord;
};

type GeneLookupRecord = LookupRecord & {
  source?: string;
  Transcript?: TranscriptLookupRecord[];
};

type XrefRecord = {
  id?: string;
  type?: string;
  dbname?: string;
  display_id?: string;
  primary_id?: string;
  description?: string;
};

type HumanGeneIndexRecord = {
  geneId: string;
  symbol: string;
  description?: string;
  biotype?: string;
};

type HomologyCandidate = {
  speciesId: string;
  source: HomologySide;
  sourceKey: string;
  sourceSequence: string;
  record: SequenceRecord;
  score: number;
};

type ProteinFeatureRecord = {
  start?: number;
  end?: number;
  type?: string;
  id?: string;
  hseqname?: string;
  description?: string;
};

type ReferencePreference = {
  score: number;
  annotation: string;
};

type FetchOrthologOptions = {
  signalPeptideMode?: SignalPeptideMode;
};

const ENSEMBL_REST = "https://rest.ensembl.org";
const ENSEMBL_BETA_GENE_SEARCH = "https://beta.ensembl.org/api/search/genes";
const BIOMART_REST = "https://www.ensembl.org/biomart/martservice";
const CLUSTALO_REST = "https://www.ebi.ac.uk/Tools/services/rest/clustalo";
const HTTP_TIMEOUT_MS = 60_000;
const HOMOLOGY_CHUNK_SIZE = 35;
const HUMAN_GRCH38_GENOME_ID = "a7335667-93e7-11ec-a39d-005056b38ce3";

export const MAX_SELECTED_SPECIES_FOR_MSA = 80;

export const HUMAN_REFERENCE: SpeciesInfo = {
  key: "human",
  label: "Human",
  scientificName: "Homo sapiens",
  ensemblId: "homo_sapiens",
  commonName: "human",
  division: "EnsemblVertebrates"
};

export const DEFAULT_TARGET_SPECIES: SpeciesInfo[] = [
  { key: "mouse", label: "Mouse", scientificName: "Mus musculus", ensemblId: "mus_musculus" },
  { key: "rat", label: "Rat", scientificName: "Rattus norvegicus", ensemblId: "rattus_norvegicus" },
  { key: "chimpanzee", label: "Chimpanzee", scientificName: "Pan troglodytes", ensemblId: "pan_troglodytes" },
  { key: "rhesus_macaque", label: "Rhesus macaque", scientificName: "Macaca mulatta", ensemblId: "macaca_mulatta" },
  { key: "chicken", label: "Chicken", scientificName: "Gallus gallus", ensemblId: "gallus_gallus" },
  { key: "anole_lizard", label: "Anole lizard", scientificName: "Anolis carolinensis", ensemblId: "anolis_carolinensis" },
  { key: "xenopus_tropicalis", label: "Xenopus tropicalis", scientificName: "Xenopus tropicalis", ensemblId: "xenopus_tropicalis" },
  { key: "spotted_gar", label: "Spotted gar", scientificName: "Lepisosteus oculatus", ensemblId: "lepisosteus_oculatus" },
  { key: "coelacanth", label: "Coelacanth", scientificName: "Latimeria chalumnae", ensemblId: "latimeria_chalumnae" }
];

const DEFAULT_BY_ID = new Map(DEFAULT_TARGET_SPECIES.map((species) => [species.ensemblId, species]));
const DEFAULT_BY_KEY = new Map(DEFAULT_TARGET_SPECIES.map((species) => [species.key, species]));

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function cleanSequence(seq: string): string {
  return seq.replace(/-/g, "").replace(/\s/g, "").toUpperCase();
}

function trimSignalPeptide(sequence: string, signalPeptide?: SignalPeptideFeature) {
  if (!signalPeptide) return sequence;
  return sequence.slice(0, signalPeptide.start - 1) + sequence.slice(signalPeptide.end);
}

function isTruthyAnnotation(value: number | boolean | undefined) {
  return value === true || value === 1;
}

function cleanQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stripStableIdVersion(value: string) {
  return value.trim().replace(/\.\d+$/, "");
}

function looksLikeHumanStableId(value: string) {
  return /^ENS[GPT]\d+(?:\.\d+)?$/i.test(value.trim());
}

function pickProteinSequence(value: unknown): string | undefined {
  const record = value as HomologySide | undefined;
  return record?.align_seq ?? record?.seq ?? record?.sequence;
}

function normalizeSpeciesId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function isSafeSpeciesId(value: string) {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

function titleFromId(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function scientificDisplayName(species: Pick<SpeciesInfo, "label" | "scientificName" | "ensemblId">) {
  return species.scientificName || species.label || species.ensemblId;
}

function speciesFromId(ensemblId: string): SpeciesInfo {
  const known = DEFAULT_BY_ID.get(ensemblId) ?? DEFAULT_BY_KEY.get(ensemblId);
  if (known) return known;

  return {
    key: ensemblId,
    label: titleFromId(ensemblId),
    scientificName: titleFromId(ensemblId),
    ensemblId
  };
}

function makeFastaId(species: SpeciesInfo) {
  if (species.ensemblId === HUMAN_REFERENCE.ensemblId) return "human";
  return species.ensemblId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 48);
}

function homologyTypeRank(type?: string) {
  switch (type) {
    case "ortholog_one2one":
      return 5;
    case "ortholog_one2many":
      return 4;
    case "ortholog_many2one":
      return 3;
    case "ortholog_many2many":
      return 2;
    default:
      return 1;
  }
}

function homologyScore(record: SequenceRecord) {
  return homologyTypeRank(record.homologyType) * 10_000 + (record.percentIdentity ?? 0);
}

function selectionReason(record: SequenceRecord) {
  const type = record.homologyType ?? "reference";
  const identity =
    typeof record.percentIdentity === "number" ? `${record.percentIdentity.toFixed(1)}% identity to human` : "source sequence";
  return `${type}; ${identity}`;
}

function signalPeptideLabel(signalPeptide: SignalPeptideFeature) {
  return `${signalPeptide.start}-${signalPeptide.end} aa${signalPeptide.description ? ` (${signalPeptide.description})` : ""}`;
}

function formatFasta(records: SequenceRecord[]): string {
  const lines: string[] = [];
  for (const rec of records) {
    const label = scientificDisplayName(rec).replace(/\s+/g, "_");
    lines.push(`>${rec.fastaId} ${label}|${rec.targetGeneId ?? "NA"}|${rec.targetProteinId ?? "NA"}`);
    for (let i = 0; i < rec.sequence.length; i += 60) {
      lines.push(rec.sequence.slice(i, i + 60));
    }
  }
  return `${lines.join("\n")}\n`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeCatalogSpecies(raw: Record<string, unknown>, fallbackDivision?: string): SpeciesInfo | null {
  const ensemblId = normalizeSpeciesId(String(raw.name ?? raw.species ?? raw.url_name ?? ""));
  if (!ensemblId || !isSafeSpeciesId(ensemblId)) return null;

  const displayName = String(raw.display_name ?? raw.common_name ?? titleFromId(ensemblId)).trim();
  const commonName = raw.common_name ? String(raw.common_name) : undefined;
  const scientificName = String(raw.scientific_name ?? titleFromId(ensemblId)).trim();
  const aliases = toArray(raw.aliases).map(String);
  const division = raw.division ? String(raw.division) : fallbackDivision;

  return {
    key: ensemblId,
    label: displayName || titleFromId(ensemblId),
    commonName,
    scientificName,
    ensemblId,
    aliases,
    division,
    assembly: raw.assembly ? String(raw.assembly) : undefined,
    release: raw.release ? String(raw.release) : undefined,
    taxonId: raw.taxon_id ? String(raw.taxon_id) : undefined
  };
}

function sortSpecies(species: SpeciesInfo[]) {
  const byId = new Map<string, SpeciesInfo>();
  for (const item of species) {
    if (!byId.has(item.ensemblId)) byId.set(item.ensemblId, item);
  }
  return [...byId.values()].sort((a, b) => {
    const division = (a.division ?? "").localeCompare(b.division ?? "");
    if (division !== 0) return division;
    return a.label.localeCompare(b.label);
  });
}

async function fetchJson<T>(path: string, params?: Record<string, string | number | boolean>) {
  const url = new URL(`${ENSEMBL_REST}${path}`);
  url.searchParams.set("content-type", "application/json");
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: timeoutSignal(HTTP_TIMEOUT_MS),
    next: { revalidate: 86_400 }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ensembl request failed (${response.status}). ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchOptionalJson<T>(path: string, params?: Record<string, string | number | boolean>) {
  const url = new URL(`${ENSEMBL_REST}${path}`);
  url.searchParams.set("content-type", "application/json");
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: timeoutSignal(HTTP_TIMEOUT_MS),
    next: { revalidate: 86_400 }
  });

  if ([400, 404].includes(response.status)) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ensembl request failed (${response.status}). ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

let humanGeneIndexPromise: Promise<HumanGeneIndexRecord[]> | undefined;

async function fetchHumanGeneIndex() {
  if (!humanGeneIndexPromise) {
    humanGeneIndexPromise = (async () => {
      const query = `<!DOCTYPE Query><Query virtualSchemaName="default" formatter="TSV" header="0" uniqueRows="1" count="" datasetConfigVersion="0.6"><Dataset name="hsapiens_gene_ensembl" interface="default"><Attribute name="ensembl_gene_id" /><Attribute name="external_gene_name" /><Attribute name="description" /><Attribute name="gene_biotype" /></Dataset></Query>`;
      const url = new URL(BIOMART_REST);
      url.searchParams.set("query", query);

      const response = await fetch(url, {
        method: "GET",
        signal: timeoutSignal(HTTP_TIMEOUT_MS),
        next: { revalidate: 604_800 }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ensembl BioMart request failed (${response.status}). ${text.slice(0, 300)}`);
      }

      const byId = new Map<string, HumanGeneIndexRecord>();
      const text = await response.text();
      if (/^\s*Query ERROR/i.test(text) || /BioMart::Exception/i.test(text)) {
        throw new Error(`Ensembl BioMart query failed. ${text.slice(0, 300)}`);
      }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [geneIdRaw, symbolRaw, descriptionRaw, biotypeRaw] = line.split("\t");
        const geneId = stripStableIdVersion(geneIdRaw ?? "");
        if (!geneId) continue;

        const symbol = (symbolRaw || geneId).trim();
        const description = descriptionRaw?.replace(/\s*\[Source:.+?\]\s*$/, "").trim();
        const biotype = biotypeRaw?.trim();
        byId.set(geneId, {
          geneId,
          symbol,
          description,
          biotype
        });
      }

      return [...byId.values()].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.geneId.localeCompare(b.geneId));
    })();
  }

  return humanGeneIndexPromise;
}

function geneSuggestionScore(record: HumanGeneIndexRecord, query: string) {
  const q = query.toLowerCase();
  const symbol = record.symbol.toLowerCase();
  const geneId = record.geneId.toLowerCase();
  const description = record.description?.toLowerCase() ?? "";

  if (symbol === q) return { score: 0, matchedBy: "symbol" as const };
  if (geneId === q) return { score: 1, matchedBy: "ensembl_id" as const };
  if (symbol.startsWith(q)) return { score: 2, matchedBy: "symbol" as const };
  if (geneId.startsWith(q)) return { score: 3, matchedBy: "ensembl_id" as const };
  if (query.length > 1 && symbol.includes(q)) return { score: 10, matchedBy: "symbol" as const };
  if (query.length > 1 && geneId.includes(q)) return { score: 11, matchedBy: "ensembl_id" as const };
  if (query.length > 1 && description.includes(q)) return { score: 20, matchedBy: "description" as const };
  return null;
}

function rankGeneSuggestions(records: HumanGeneIndexRecord[], query: string, limit: number): HumanGeneSuggestion[] {
  return records
    .map((record) => {
      const match = geneSuggestionScore(record, query);
      return match ? { record, match } : null;
    })
    .filter((item): item is { record: HumanGeneIndexRecord; match: NonNullable<ReturnType<typeof geneSuggestionScore>> } =>
      Boolean(item)
    )
    .sort(
      (a, b) =>
        a.match.score - b.match.score ||
        a.record.symbol.length - b.record.symbol.length ||
        a.record.symbol.localeCompare(b.record.symbol)
    )
    .slice(0, limit)
    .map(({ record, match }) => ({
      geneId: record.geneId,
      symbol: record.symbol,
      description: record.description,
      biotype: record.biotype,
      matchedBy: match.matchedBy
    }));
}

async function searchBetaHumanGenes(query: string, limit: number) {
  const response = await fetch(ENSEMBL_BETA_GENE_SEARCH, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      genome_ids: [HUMAN_GRCH38_GENOME_ID],
      per_page: Math.max(100, limit)
    }),
    signal: timeoutSignal(HTTP_TIMEOUT_MS),
    next: { revalidate: 3_600 }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ensembl gene search failed (${response.status}). ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    matches?: Array<{
      stable_id?: string;
      unversioned_stable_id?: string;
      symbol?: string;
      name?: string;
      biotype?: string;
    }>;
  };

  const byId = new Map<string, HumanGeneIndexRecord>();
  for (const match of payload.matches ?? []) {
    const geneId = stripStableIdVersion(match.unversioned_stable_id || match.stable_id || "");
    if (!geneId) continue;
    byId.set(geneId, {
      geneId,
      symbol: match.symbol || geneId,
      description: match.name,
      biotype: match.biotype
    });
  }

  return rankGeneSuggestions([...byId.values()], query, limit);
}

export async function searchHumanGeneSuggestions(query: string, limit = 12): Promise<HumanGeneSuggestion[]> {
  const clean = cleanQuery(query);
  if (!clean) return [];

  try {
    const betaSuggestions = await searchBetaHumanGenes(clean, limit);
    if (betaSuggestions.length) return betaSuggestions;
  } catch {
    // Fall through to BioMart so temporary search API issues do not break lookup suggestions.
  }

  const index = await fetchHumanGeneIndex();
  return rankGeneSuggestions(index, clean, limit);
}

async function lookupId(id: string) {
  const stableId = stripStableIdVersion(id);
  return fetchOptionalJson<LookupRecord>(`/lookup/id/${encodeURIComponent(stableId)}`);
}

async function lookupSymbol(symbol: string) {
  return fetchOptionalJson<LookupRecord>(`/lookup/symbol/homo_sapiens/${encodeURIComponent(symbol)}`);
}

async function fetchHumanReferencePreferences(geneId: string): Promise<Map<string, ReferencePreference>> {
  const gene = await fetchOptionalJson<GeneLookupRecord>(`/lookup/id/${encodeURIComponent(geneId)}`, { expand: 1 });
  const preferences = new Map<string, ReferencePreference>();

  for (const transcript of gene?.Transcript ?? []) {
    const proteinId = transcript.Translation?.id;
    if (!proteinId) continue;

    const source = transcript.source?.toLowerCase() ?? "";
    const tags: string[] = [];
    let score = 0;

    if (source.includes("ensembl_havana")) {
      score += 500;
      tags.push("Ensembl-Havana merged");
    } else if (source.includes("havana")) {
      score += 350;
      tags.push("HAVANA/GENCODE");
    } else if (source.includes("ensembl")) {
      score += 150;
      tags.push("Ensembl");
    }

    if (isTruthyAnnotation(transcript.gencode_primary)) {
      score += 300;
      tags.push("GENCODE primary");
    }

    if (isTruthyAnnotation(transcript.is_canonical)) {
      score += 220;
      tags.push("canonical");
    }

    if (transcript.biotype === "protein_coding") {
      score += 80;
      tags.push("protein-coding");
    }

    preferences.set(proteinId, {
      score,
      annotation: tags.length ? tags.join(", ") : "Ensembl protein annotation"
    });
  }

  return preferences;
}

function normalizeSignalFeature(feature: ProteinFeatureRecord): SignalPeptideFeature | null {
  const text = [feature.type, feature.id, feature.hseqname, feature.description].filter(Boolean).join(" ").toLowerCase();
  if (!text.includes("signalp") && !text.includes("signal peptide")) return null;

  const start = Number(feature.start);
  const end = Number(feature.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return null;

  return {
    start,
    end,
    type: feature.type,
    description: feature.description || feature.hseqname || feature.id
  };
}

async function fetchSignalPeptide(proteinId: string | undefined): Promise<SignalPeptideFeature | undefined> {
  if (!proteinId) return undefined;

  const features = await fetchOptionalJson<ProteinFeatureRecord[]>(`/overlap/translation/${encodeURIComponent(proteinId)}`, {
    feature: "protein_feature"
  });
  const signalFeatures = (features ?? [])
    .map(normalizeSignalFeature)
    .filter((feature): feature is SignalPeptideFeature => Boolean(feature))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  return signalFeatures[0];
}

function applySignalPeptideMode(record: SequenceRecord, signalPeptideMode: SignalPeptideMode): SequenceRecord {
  if (!record.signalPeptide || signalPeptideMode !== "trim") {
    return {
      ...record,
      signalPeptideRemoved: false
    };
  }

  const trimmedSequence = trimSignalPeptide(record.sequence, record.signalPeptide);
  return {
    ...record,
    sequence: trimmedSequence,
    length: trimmedSequence.length,
    fullLength: record.sequence.length,
    signalPeptideRemoved: true,
    selectionReason: `${record.selectionReason ?? "selected sequence"}; signal peptide removed ${signalPeptideLabel(record.signalPeptide)}`
  };
}

async function annotateSignalPeptides(records: SequenceRecord[], signalPeptideMode: SignalPeptideMode) {
  const annotated: SequenceRecord[] = [];

  for (const recordChunk of chunk(records, 20)) {
    const settled = await Promise.allSettled(
      recordChunk.map(async (record) => ({
        ...record,
        signalPeptide: await fetchSignalPeptide(record.targetProteinId)
      }))
    );

    for (let i = 0; i < settled.length; i += 1) {
      const result = settled[i];
      const original = recordChunk[i];
      const record = result.status === "fulfilled" ? result.value : original;
      annotated.push(applySignalPeptideMode(record, signalPeptideMode));
    }
  }

  return annotated;
}

async function resolveLookupRecord(
  record: LookupRecord | null,
  input: string,
  matchedBy: string,
  depth = 0
): Promise<HumanQueryResolution | null> {
  if (!record?.id || depth > 3) return null;
  if (record.species && normalizeSpeciesId(record.species) !== HUMAN_REFERENCE.ensemblId) return null;

  const id = stripStableIdVersion(record.id);
  const objectType = record.object_type?.toLowerCase();
  if (objectType === "gene" || /^ENSG\d+/i.test(id)) {
    return {
      input,
      geneId: id,
      symbol: record.display_name || id,
      description: record.description,
      matchedBy
    };
  }

  if (record.Parent) {
    const parent = await lookupId(record.Parent);
    return resolveLookupRecord(parent, input, matchedBy, depth + 1);
  }

  return null;
}

async function resolveXrefs(query: string, path: "symbol" | "name") {
  const hits = await fetchOptionalJson<XrefRecord[]>(`/xrefs/${path}/homo_sapiens/${encodeURIComponent(query)}`);
  if (!hits?.length) return null;

  const ranked = [...hits].sort((a, b) => {
    const typeRank = (value?: string) => {
      const type = value?.toLowerCase();
      if (type === "gene") return 0;
      if (type === "transcript") return 1;
      if (type === "translation") return 2;
      return 3;
    };
    const dbRank = (value?: string) => (value?.toUpperCase().includes("HGNC") ? 0 : 1);
    return typeRank(a.type) - typeRank(b.type) || dbRank(a.dbname) - dbRank(b.dbname);
  });

  for (const hit of ranked) {
    if (!hit.id) continue;
    const resolved = await resolveLookupRecord(await lookupId(hit.id), query, path === "symbol" ? "xref symbol" : "xref name");
    if (resolved) {
      return {
        ...resolved,
        symbol: resolved.symbol || hit.display_id || hit.primary_id || resolved.geneId,
        description: resolved.description || hit.description
      };
    }
  }

  return null;
}

export async function resolveHumanGeneQuery(query: string): Promise<HumanQueryResolution> {
  const input = cleanQuery(query);
  if (!input) throw new Error("Human gene, protein name, or Ensembl ID is required. Example: TP53, tumor protein p53, ENSG00000141510.");

  if (looksLikeHumanStableId(input)) {
    const resolved = await resolveLookupRecord(await lookupId(input), input, "Ensembl ID");
    if (resolved) return resolved;
  }

  const symbolResolved = await resolveLookupRecord(await lookupSymbol(input), input, "gene symbol");
  if (symbolResolved) return symbolResolved;

  const xrefSymbolResolved = await resolveXrefs(input, "symbol");
  if (xrefSymbolResolved) return xrefSymbolResolved;

  const xrefNameResolved = await resolveXrefs(input, "name");
  if (xrefNameResolved) return xrefNameResolved;

  const [suggestion] = await searchHumanGeneSuggestions(input, 1);
  if (suggestion) {
    return {
      input,
      geneId: suggestion.geneId,
      symbol: suggestion.symbol,
      description: suggestion.description,
      matchedBy: suggestion.matchedBy === "description" ? "Ensembl gene description" : "Ensembl gene search"
    };
  }

  throw new Error(
    `No human Ensembl gene was found for '${input}'. Use a human gene symbol, protein description, Ensembl gene ID, transcript ID, or protein ID.`
  );
}

export async function fetchEnsemblDivisions() {
  const payload = await fetchJson<string[] | { divisions?: string[]; value?: string[] }>("/info/divisions");
  if (Array.isArray(payload)) return payload;
  return payload.divisions ?? payload.value ?? ["EnsemblVertebrates"];
}

export async function fetchSpeciesCatalog(division = "all") {
  const divisions = await fetchEnsemblDivisions();
  const selectedDivisions = division === "all" ? divisions : divisions.filter((item) => item === division);
  const speciesGroups = await Promise.allSettled(
    selectedDivisions.map(async (currentDivision) => {
      const payload = await fetchJson<{ species?: Record<string, unknown>[] }>("/info/species", {
        division: currentDivision,
        hide_strain_info: 1
      });
      return toArray(payload.species)
        .map((item) => normalizeCatalogSpecies(item as Record<string, unknown>, currentDivision))
        .filter((item): item is SpeciesInfo => Boolean(item));
    })
  );

  const species = speciesGroups.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return { divisions, species: sortSpecies(species) };
}

export function defaultTargetSpeciesKeys() {
  return DEFAULT_TARGET_SPECIES.map((species) => species.ensemblId);
}

export function normalizeRequestedSpecies(values: Array<string | SpeciesInfo>) {
  const resolved: SpeciesInfo[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const species =
      typeof value === "string"
        ? speciesFromId(normalizeSpeciesId(value))
        : {
            ...speciesFromId(normalizeSpeciesId(value.ensemblId || value.key)),
            ...value,
            ensemblId: normalizeSpeciesId(value.ensemblId || value.key),
            key: normalizeSpeciesId(value.ensemblId || value.key)
          };

    if (!species.ensemblId || species.ensemblId === HUMAN_REFERENCE.ensemblId) continue;
    if (!isSafeSpeciesId(species.ensemblId)) throw new Error(`Invalid Ensembl species id: ${species.ensemblId}`);
    if (seen.has(species.ensemblId)) continue;
    seen.add(species.ensemblId);
    resolved.push(species);
  }

  if (resolved.length > MAX_SELECTED_SPECIES_FOR_MSA) {
    throw new Error(`Too many species selected. Select ${MAX_SELECTED_SPECIES_FOR_MSA} or fewer for one MSA job.`);
  }

  return resolved;
}

async function fetchHomologyChunk(resolvedQuery: HumanQueryResolution, selectedTargets: SpeciesInfo[]) {
  const url = new URL(`${ENSEMBL_REST}/homology/id/homo_sapiens/${encodeURIComponent(resolvedQuery.geneId)}`);
  url.searchParams.set("type", "orthologues");
  url.searchParams.set("sequence", "protein");
  for (const species of selectedTargets) {
    url.searchParams.append("target_species", species.ensemblId);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    signal: timeoutSignal(HTTP_TIMEOUT_MS)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ensembl homology request failed (${response.status}). ${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  const homologies = (payload?.data?.[0]?.homologies ?? []) as HomologyRecord[];
  return { homologies, url: url.toString() };
}

export function toFasta(records: SequenceRecord[]): string {
  return formatFasta(records);
}

export async function fetchOrthologs(
  geneQuery: string,
  selectedValues: Array<string | SpeciesInfo>,
  options: FetchOrthologOptions = {}
) {
  const signalPeptideMode = options.signalPeptideMode ?? "include";
  const resolvedQuery = await resolveHumanGeneQuery(geneQuery);
  const selectedTargets = normalizeRequestedSpecies(selectedValues);
  if (!selectedTargets.length) {
    throw new Error("At least one target species is required. Human is always included as the reference.");
  }

  const humanReferencePreferences = await fetchHumanReferencePreferences(resolvedQuery.geneId);
  const candidates: HomologyCandidate[] = [];
  const ensemblUrls: string[] = [];

  for (const targetChunk of chunk(selectedTargets, HOMOLOGY_CHUNK_SIZE)) {
    const result = await fetchHomologyChunk(resolvedQuery, targetChunk);
    ensemblUrls.push(result.url);

    for (const h of result.homologies) {
      const target = h.target;
      const sequenceText = pickProteinSequence(target);
      const sourceSequenceText = pickProteinSequence(h.source);
      if (!target?.species || !sequenceText || !h.source || !sourceSequenceText) continue;

      const species = selectedTargets.find((item) => item.ensemblId === target.species);
      if (!species) continue;

      const sequence = cleanSequence(sequenceText);
      const candidate: SequenceRecord = {
        ...species,
        key: species.ensemblId,
        fastaId: makeFastaId(species),
        sequence,
        length: sequence.length,
        homologyType: h.type,
        percentIdentity: typeof target.perc_id === "number" ? target.perc_id : undefined,
        targetGeneId: target.id,
        targetProteinId: target.protein_id
      };
      candidate.selectionReason = selectionReason(candidate);
      const sourceKey = h.source.protein_id || h.source.id || cleanSequence(sourceSequenceText).slice(0, 80);
      if (h.source.protein_id) {
        candidate.selectionReason = `${candidate.selectionReason}; human isoform ${h.source.protein_id}`;
      }

      candidates.push({
        speciesId: species.ensemblId,
        source: h.source,
        sourceKey,
        sourceSequence: sourceSequenceText,
        record: candidate,
        score: homologyScore(candidate)
      });
    }
  }

  if (!candidates.length) {
    throw new Error(
      `No ortholog protein sequence was found for '${resolvedQuery.symbol}' (${resolvedQuery.geneId}). The selected species may not have Ensembl orthologs for this human gene.`
    );
  }

  const sourceGroups = new Map<
    string,
    {
      source: HomologySide;
      sourceSequence: string;
      bestBySpecies: Map<string, HomologyCandidate>;
    }
  >();

  for (const candidate of candidates) {
    const group =
      sourceGroups.get(candidate.sourceKey) ??
      {
        source: candidate.source,
        sourceSequence: candidate.sourceSequence,
        bestBySpecies: new Map<string, HomologyCandidate>()
      };
    const existing = group.bestBySpecies.get(candidate.speciesId);
    if (!existing || candidate.score > existing.score) {
      group.bestBySpecies.set(candidate.speciesId, candidate);
    }
    sourceGroups.set(candidate.sourceKey, group);
  }

  const bestSourceGroup = [...sourceGroups.values()].sort((a, b) => {
    const score = (group: { source: HomologySide; bestBySpecies: Map<string, HomologyCandidate> }) => {
      const referencePreference = group.source.protein_id ? humanReferencePreferences.get(group.source.protein_id)?.score ?? 0 : 0;
      return (
        group.bestBySpecies.size * 1_000_000 +
        referencePreference * 1_000 +
        [...group.bestBySpecies.values()].reduce((sum, item) => sum + item.score, 0)
      );
    };
    return score(b) - score(a);
  })[0];

  const source = bestSourceGroup.source;
  const sourceSequence = bestSourceGroup.sourceSequence;
  const humanSequence = cleanSequence(sourceSequence);
  const referencePreference = source.protein_id ? humanReferencePreferences.get(source.protein_id) : undefined;
  const humanRecord: SequenceRecord = {
    ...HUMAN_REFERENCE,
    fastaId: "human",
    sequence: humanSequence,
    length: humanSequence.length,
    selectionReason: `Ensembl source protein resolved from ${resolvedQuery.matchedBy}`,
    targetGeneId: source.id ?? resolvedQuery.geneId,
    targetProteinId: source.protein_id,
    sourceAnnotation: referencePreference?.annotation
  };
  if (referencePreference?.annotation) {
    humanRecord.selectionReason = `${humanRecord.selectionReason}; ${referencePreference.annotation}`;
  }

  const orderedRecordsWithoutSignalMode = [
    humanRecord,
    ...selectedTargets
      .map((species) => bestSourceGroup.bestBySpecies.get(species.ensemblId)?.record)
      .filter((rec): rec is SequenceRecord => Boolean(rec))
  ];

  const orderedRecords = await annotateSignalPeptides(orderedRecordsWithoutSignalMode, signalPeptideMode);

  if (orderedRecords.length < 2) {
    throw new Error("At least two protein sequences are required for MSA. The selected species may not have Ensembl orthologs for this human gene.");
  }

  const missing = selectedTargets
    .filter((species) => !bestSourceGroup.bestBySpecies.has(species.ensemblId))
    .map((species) => `${scientificDisplayName(species)} (${species.ensemblId})`);

  return {
    records: orderedRecords,
    missing,
    fasta: formatFasta(orderedRecords),
    ensemblUrl: ensemblUrls[0],
    ensemblUrls,
    resolvedQuery,
    signalPeptideMode
  };
}

export async function submitClustalOmega(fastaText: string, email: string) {
  const submitData = new URLSearchParams();
  submitData.set("email", email || "anonymous@example.com");
  submitData.set("sequence", fastaText);
  submitData.set("stype", "protein");
  submitData.set("outfmt", "clustal_num");

  const submit = await fetch(`${CLUSTALO_REST}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: submitData,
    signal: timeoutSignal(HTTP_TIMEOUT_MS)
  });

  if (!submit.ok) {
    const text = await submit.text();
    throw new Error(`Clustal Omega submission failed (${submit.status}). ${text.slice(0, 300)}`);
  }

  const jobId = (await submit.text()).trim();
  if (!jobId) throw new Error("Clustal Omega did not return a job id.");
  return jobId;
}

export async function getClustalOmegaStatus(jobId: string): Promise<ClustalStatus> {
  const statusRes = await fetch(`${CLUSTALO_REST}/status/${encodeURIComponent(jobId)}`, {
    signal: timeoutSignal(HTTP_TIMEOUT_MS)
  });

  if (!statusRes.ok) {
    const text = await statusRes.text();
    throw new Error(`Clustal Omega status check failed (${statusRes.status}). ${text.slice(0, 300)}`);
  }

  return (await statusRes.text()).trim() as ClustalStatus;
}

export async function getClustalOmegaAlignment(jobId: string) {
  const result = await fetch(`${CLUSTALO_REST}/result/${encodeURIComponent(jobId)}/aln-clustal_num`, {
    signal: timeoutSignal(HTTP_TIMEOUT_MS)
  });

  if (!result.ok) {
    const text = await result.text();
    throw new Error(`Clustal Omega result fetch failed (${result.status}). ${text.slice(0, 300)}`);
  }

  return result.text();
}

export function parseClustal(alignmentText: string): Record<string, string> {
  const seqs: Record<string, string[]> = {};
  for (const rawLine of alignmentText.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith("CLUSTAL") || rawLine.startsWith(" ")) continue;
    const parts = rawLine.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [name, sequenceChunk] = parts;
    if (!/[A-Za-z-]/.test(sequenceChunk)) continue;
    if (!seqs[name]) seqs[name] = [];
    seqs[name].push(sequenceChunk);
  }
  return Object.fromEntries(Object.entries(seqs).map(([name, chunks]) => [name, chunks.join("")]));
}

export function summarizeIdentity(aligned: Record<string, string>, referenceId = "human"): IdentityRecord[] {
  const humanKey = Object.keys(aligned).find((key) => key === referenceId || key.startsWith(`${referenceId}|`));
  if (!humanKey) return [];
  const ref = aligned[humanKey];

  return Object.entries(aligned)
    .filter(([species]) => species !== humanKey)
    .map(([species, seq]) => {
      let comparedResidues = 0;
      let matches = 0;
      const n = Math.min(ref.length, seq.length);
      for (let i = 0; i < n; i += 1) {
        const a = ref[i];
        const b = seq[i];
        if (a !== "-" && b !== "-") {
          comparedResidues += 1;
          if (a === b) matches += 1;
        }
      }
      return {
        species,
        identity: comparedResidues ? (matches / comparedResidues) * 100 : 0,
        comparedResidues,
        matches
      };
    })
    .sort((a, b) => b.identity - a.identity);
}
