import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCompanyName,
  calculateCompanyNameSimilarity,
  isStrongCompanyNameMatch,
} from "@/lib/ipo-matching";

const PAGE_SIZE = 500;
const MAX_RECORDS = 5000;
const MAX_COMPARISONS = 500000;
const MAX_SAMPLE_PAIRS = 100;
const MAX_NO_TOKEN_SAMPLES = 50;

const GENERIC_WORDS = new Set([
  "india",
  "indian",
  "industries",
  "industry",
  "technology",
  "technologies",
  "services",
  "solutions",
  "global",
  "international",
  "limited",
  "ltd",
  "private",
  "pvt",
  "company",
  "corporation",
  "corporate",
  "group",
  "holdings",
  "holding",
  "enterprises",
  "enterprise",
]);

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
};

type PreparedRecord = QueueRecord & {
  normalized: string;
  tokens: Set<string>;
};

type MatchPair = {
  first_id: string;
  first_company: string;
  first_source: string;
  second_id: string;
  second_company: string;
  second_source: string;
  similarity_score: number;
  issue_type: string | null;
};

type DiagnosticPair = {
  first_company: string;
  first_source: string;
  second_company: string;
  second_source: string;
};

function getMatchTokens(name: string): Set<string> {
  return new Set(
    name
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 3 &&
          !GENERIC_WORDS.has(word)
      )
  );
}

function hasTokenOverlap(
  first: Set<string>,
  second: Set<string>
): boolean {
  for (const token of first) {
    if (second.has(token)) {
      return true;
    }
  }

  return false;
}

function normalizeIssueType(value: string | null): string {
  return (value || "").trim().toLowerCase();
}

export async function runIpoMatching() {
  const records: QueueRecord[] = [];
  let offset = 0;

  // READ ONLY: fetch queue records.
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("ipo_import_queue")
      .select("id, source_name, company_name, ipo_type")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error("Could not read IPO import queue.");
    }

    const page = (data || []) as QueueRecord[];
    records.push(...page);

    if (records.length > MAX_RECORDS) {
      throw new Error(
        `Queue exceeds safe limit of ${MAX_RECORDS} records.`
      );
    }

    if (page.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  const prepared: PreparedRecord[] = records.map((record) => {
    const normalized = normalizeCompanyName(
      record.company_name
    );

    return {
      ...record,
      normalized,
      tokens: getMatchTokens(normalized),
    };
  });

  const sourceCounts = new Map<string, number>();

  for (const record of prepared) {
    sourceCounts.set(
      record.source_name,
      (sourceCounts.get(record.source_name) || 0) + 1
    );
  }

  const totalPossiblePairs =
    (prepared.length * (prepared.length - 1)) / 2;

  let sameSourcePairsExcluded = 0;

  for (const count of sourceCounts.values()) {
    sameSourcePairsExcluded +=
      (count * (count - 1)) / 2;
  }

  const possibleCrossSourcePairs =
    totalPossiblePairs - sameSourcePairsExcluded;

  if (possibleCrossSourcePairs > MAX_COMPARISONS) {
    throw new Error(
      `Cross-source pair limit exceeded. Found ${possibleCrossSourcePairs} possible pairs; safe limit is ${MAX_COMPARISONS}.`
    );
  }

  const bestScores = new Map<string, number>();
  const samplePairs: MatchPair[] = [];
  const sampleNoTokenOverlapPairs: DiagnosticPair[] = [];

  let crossSourcePairsConsidered = 0;
  let comparisons = 0;
  let typeMismatchPairs = 0;
  let tokenOverlapPairs = 0;
  let noTokenOverlapPairs = 0;
  let candidatePairs = 0;

  // Compare every cross-source pair.
  // Token overlap is diagnostic only; it never blocks comparison.
  for (let i = 0; i < prepared.length; i++) {
    const first = prepared[i];

    for (let j = i + 1; j < prepared.length; j++) {
      const second = prepared[j];

      // Same-source records are excluded before counting.
      if (first.source_name === second.source_name) {
        continue;
      }

      crossSourcePairsConsidered++;

      const firstType = normalizeIssueType(first.ipo_type);
      const secondType = normalizeIssueType(second.ipo_type);

      if (
        firstType &&
        secondType &&
        firstType !== secondType
      ) {
        typeMismatchPairs++;
        continue;
      }

      comparisons++;

      const overlap = hasTokenOverlap(
        first.tokens,
        second.tokens
      );

      if (overlap) {
        tokenOverlapPairs++;
      } else {
        noTokenOverlapPairs++;

        if (
          sampleNoTokenOverlapPairs.length <
          MAX_NO_TOKEN_SAMPLES
        ) {
          sampleNoTokenOverlapPairs.push({
            first_company: first.company_name,
            first_source: first.source_name,
            second_company: second.company_name,
            second_source: second.source_name,
          });
        }
      }

      // Name matching is now performed even without token overlap.
      const score = calculateCompanyNameSimilarity(
        first.company_name,
        second.company_name
      );

      if (
        !isStrongCompanyNameMatch(
          first.company_name,
          second.company_name
        )
      ) {
        continue;
      }

      candidatePairs++;

      bestScores.set(
        first.id,
        Math.max(bestScores.get(first.id) || 0, score)
      );

      bestScores.set(
        second.id,
        Math.max(bestScores.get(second.id) || 0, score)
      );

      if (samplePairs.length < MAX_SAMPLE_PAIRS) {
        samplePairs.push({
          first_id: first.id,
          first_company: first.company_name,
          first_source: first.source_name,
          second_id: second.id,
          second_company: second.company_name,
          second_source: second.source_name,
          similarity_score: score,
          issue_type: first.ipo_type || second.ipo_type,
        });
      }
    }
  }

  // READ ONLY: no database writes.
  return {
    mode: "dry_run",
    readOnly: true,
    databaseWrites: 0,

    processed: records.length,
    sourceCounts: Object.fromEntries(sourceCounts),

    totalPossiblePairs,
    sameSourcePairsExcluded,
    possibleCrossSourcePairs,
    crossSourcePairsConsidered,

    comparisons,
    typeMismatchPairs,
    tokenOverlapPairs,
    noTokenOverlapPairs,

    candidatePairs,
    recordsWithCandidates: bestScores.size,

    samplePairs,
    samplePairsLimit: MAX_SAMPLE_PAIRS,

    sampleNoTokenOverlapPairs,
    noTokenSampleLimit: MAX_NO_TOKEN_SAMPLES,

    verified: 0,
    linked: 0,
    published: 0,
  };
}
