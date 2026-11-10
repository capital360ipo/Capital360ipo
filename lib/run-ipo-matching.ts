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

const GENERIC_WORDS = new Set([
  "india", "indian", "industries", "industry",
  "technology", "technologies", "services",
  "solutions", "global", "international",
  "limited", "ltd", "private", "pvt",
  "company", "corporation", "corporate",
  "group", "holdings", "holding",
  "enterprises", "enterprise",
]);

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
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

function normalizeIssueType(value: string | null): string {
  return (value || "").trim().toLowerCase();
}

export async function runIpoMatching() {
  const records: QueueRecord[] = [];
  let offset = 0;

  // READ ONLY: fetch records from the import queue.
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

  const prepared = records.map((record) => {
    const normalized = normalizeCompanyName(
      record.company_name
    );

    return {
      ...record,
      normalized,
      tokens: getMatchTokens(normalized),
    };
  });

  const tokenIndex = new Map<string, number[]>();

  for (let i = 0; i < prepared.length; i++) {
    for (const token of prepared[i].tokens) {
      const existing = tokenIndex.get(token) || [];
      existing.push(i);
      tokenIndex.set(token, existing);
    }
  }

  const bestScores = new Map<string, number>();
  const samplePairs: MatchPair[] = [];

  let candidatePairs = 0;
  let typeMismatchPairs = 0;
  let comparisons = 0;

  for (let i = 0; i < prepared.length; i++) {
    const first = prepared[i];

    if (!first.normalized || first.tokens.size === 0) {
      continue;
    }

    const possibleMatches = new Set<number>();

    for (const token of first.tokens) {
      const indices = tokenIndex.get(token) || [];

      for (const index of indices) {
        if (index > i) {
          possibleMatches.add(index);
        }
      }
    }

    for (const j of possibleMatches) {
      comparisons++;

      if (comparisons > MAX_COMPARISONS) {
        throw new Error(
          "Dry run exceeded its safe comparison limit."
        );
      }

      const second = prepared[j];

      if (first.source_name === second.source_name) {
        continue;
      }

      if (
        !second.normalized ||
        second.tokens.size === 0
      ) {
        continue;
      }

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

      if (
        !isStrongCompanyNameMatch(
          first.company_name,
          second.company_name
        )
      ) {
        continue;
      }

      const score = calculateCompanyNameSimilarity(
        first.company_name,
        second.company_name
      );

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

  // No database writes are performed in this function.
  return {
    mode: "dry_run",
    readOnly: true,
    databaseWrites: 0,
    processed: records.length,
    comparisons,
    candidatePairs,
    recordsWithCandidates: bestScores.size,
    typeMismatchPairs,
    samplePairs,
    samplePairsLimit: MAX_SAMPLE_PAIRS,
    verified: 0,
    linked: 0,
    published: 0,
  };
}
