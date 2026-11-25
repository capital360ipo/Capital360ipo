import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

import {
  normalizeCompanyName,
  normalizeIpoType,
  calculateCompanyNameSimilarity,
  isStrongCompanyNameMatch,
  getDistinctiveWords,
} from "@/lib/ipo-matching";

const PAGE_SIZE = 500;
const MAX_RECORDS = 5000;
const MAX_COMPARISONS = 500000;
const MAX_SAMPLE_PAIRS = 100;
const MAX_NO_TOKEN_SAMPLES = 50;
const TOP_SIMILARITY_LIMIT = 20;
const STRONG_MATCH_THRESHOLD = 90;

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
  detected_status: string | null;
};

type PreparedRecord = QueueRecord & {
  normalized: string;
  tokens: Set<string>;
  normalizedType: string;
};

type MatchPair = {
  first_id: string;
  first_company: string;
  first_source: string;
  second_id: string;
  second_company: string;
  second_source: string;
  similarity_score: number;
  issue_type: string;
};

type SimilarityPair = {
  first_company: string;
  first_source: string;
  second_company: string;
  second_source: string;
  similarity_score: number;
  threshold_gap: number;
  strong_match: boolean;
  first_ipo_type: string | null;
  second_ipo_type: string | null;
  issue_type_status: "match" | "mismatch" | "missing";
};

type DiagnosticPair = {
  first_company: string;
  first_source: string;
  second_company: string;
  second_source: string;
};

function getMatchTokens(name: string): Set<string> {
  return getDistinctiveWords(name);
}

function hasTokenOverlap(
  first: Set<string>,
  second: Set<string>
): boolean {
  for (const token of first) {
    if (second.has(token)) return true;
  }

  return false;
}

function addTopSimilarity(
  list: SimilarityPair[],
  pair: SimilarityPair
) {
  list.push(pair);

  list.sort(
    (a, b) => b.similarity_score - a.similarity_score
  );

  if (list.length > TOP_SIMILARITY_LIMIT) {
    list.pop();
  }
}

export async function runIpoMatching() {
  const records: QueueRecord[] = [];
  let offset = 0;

  // READ ONLY: fetch queue records.
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("ipo_import_queue")
      .select(
        "id, source_name, company_name, ipo_type, detected_status"
      )
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

  const statusCounts: Record<string, number> = {};

  for (const record of records) {
    const status = (record.detected_status || "missing")
      .trim()
      .toLowerCase();

    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  // Only DRHP-filed IPOs enter Upcoming IPO matching.
  const upcomingRecords = records.filter(
    (record) =>
      (record.detected_status || "").trim().toLowerCase() ===
      "drhp_filed"
  );

  const historicalExcluded = records.filter(
    (record) =>
      (record.detected_status || "").trim().toLowerCase() ===
      "nse_historical"
  ).length;

  const listedExcluded = records.filter(
    (record) =>
      (record.detected_status || "").trim().toLowerCase() ===
      "listed"
  ).length;

  const otherStatusExcluded =
    records.length -
    upcomingRecords.length -
    historicalExcluded -
    listedExcluded;

  const prepared: PreparedRecord[] = upcomingRecords.map(
    (record) => {
      const normalized = normalizeCompanyName(
        record.company_name
      );

      return {
        ...record,
        normalized,
        tokens: getMatchTokens(normalized),
        normalizedType: normalizeIpoType(record.ipo_type),
      };
    }
  );

  // Records without a recognized IPO type are not compared.
  const eligibleRecords = prepared.filter(
    (record) =>
      record.normalizedType === "mainboard" ||
      record.normalizedType === "sme"
  );

  const missingOrUnknownTypeRecords = prepared.filter(
    (record) =>
      !record.normalizedType
  );

  const sourceCounts: Record<string, number> = {};
  const eligibleSourceCounts: Record<string, number> = {};

  for (const record of records) {
    sourceCounts[record.source_name] =
      (sourceCounts[record.source_name] || 0) + 1;
  }

  for (const record of eligibleRecords) {
    eligibleSourceCounts[record.source_name] =
      (eligibleSourceCounts[record.source_name] || 0) + 1;
  }

  const totalPossiblePairs =
    (eligibleRecords.length * (eligibleRecords.length - 1)) / 2;

  let sameSourcePairsExcluded = 0;

  for (const count of Object.values(eligibleSourceCounts)) {
    sameSourcePairsExcluded +=
      (count * (count - 1)) / 2;
  }

  const possibleCrossSourcePairs =
    totalPossiblePairs - sameSourcePairsExcluded;

  if (possibleCrossSourcePairs > MAX_COMPARISONS) {
    throw new Error(
      `Cross-source pair limit exceeded. Safe limit: ${MAX_COMPARISONS}.`
    );
  }

  const bestScores = new Map<string, number>();
  const samplePairs: MatchPair[] = [];
  const sampleNoTokenOverlapPairs: DiagnosticPair[] = [];
  const topSimilarityPairs: SimilarityPair[] = [];

  let crossSourcePairsConsidered = 0;
  let comparisons = 0;
  let typeMismatchPairs = 0;
  let typeMissingPairs = 0;
  let tokenOverlapPairs = 0;
  let noTokenOverlapPairs = 0;
  let candidatePairs = 0;

  for (let i = 0; i < eligibleRecords.length; i++) {
    const first = eligibleRecords[i];

    for (let j = i + 1; j < eligibleRecords.length; j++) {
      const second = eligibleRecords[j];

      if (first.source_name === second.source_name) {
        continue;
      }

      crossSourcePairsConsidered++;

      // Mainboard only compares with Mainboard.
      // SME only compares with SME.
      if (first.normalizedType !== second.normalizedType) {
        typeMismatchPairs++;
        continue;
      }

      comparisons++;

      const overlap = hasTokenOverlap(
        first.tokens,
        second.tokens
      );

      if (!overlap) {
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

        // Do not display unrelated 0% pairs as possible matches.
        continue;
      }

      tokenOverlapPairs++;

      const score = calculateCompanyNameSimilarity(
        first.company_name,
        second.company_name
      );

      const strongMatch = isStrongCompanyNameMatch(
        first.company_name,
        second.company_name
      );

      addTopSimilarity(topSimilarityPairs, {
        first_company: first.company_name,
        first_source: first.source_name,
        second_company: second.company_name,
        second_source: second.source_name,
        similarity_score: score,
        threshold_gap: Math.max(
          0,
          STRONG_MATCH_THRESHOLD - score
        ),
        strong_match: strongMatch,
        first_ipo_type: first.ipo_type,
        second_ipo_type: second.ipo_type,
        issue_type_status: "match",
      });

      if (!strongMatch || score < STRONG_MATCH_THRESHOLD) {
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
          issue_type: first.normalizedType,
        });
      }
    }
  }

  // READ ONLY: this function does not update any database records.
  return {
    mode: "dry_run",
    readOnly: true,
    databaseWrites: 0,

    processed: records.length,
    sourceCounts,
    statusCounts,

    upcomingDrhpRecords: upcomingRecords.length,
    eligibleUpcomingRecords: eligibleRecords.length,
    missingOrUnknownTypeRecords:
      missingOrUnknownTypeRecords.length,

    historicalExcluded,
    listedExcluded,
    otherStatusExcluded,

    totalPossiblePairs,
    sameSourcePairsExcluded,
    possibleCrossSourcePairs,
    crossSourcePairsConsidered,

    comparisons,
    typeMismatchPairs,
    typeMissingPairs,

    tokenOverlapPairs,
    noTokenOverlapPairs,

    candidatePairs,
    recordsWithCandidates: bestScores.size,

    topSimilarityPairs,
    topSimilarityLimit: TOP_SIMILARITY_LIMIT,
    strongMatchThreshold: STRONG_MATCH_THRESHOLD,

    samplePairs,
    samplePairsLimit: MAX_SAMPLE_PAIRS,

    sampleNoTokenOverlapPairs,
    noTokenSampleLimit: MAX_NO_TOKEN_SAMPLES,

    verified: 0,
    linked: 0,
    published: 0,
  };
}
