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
const UPDATE_CONCURRENCY = 10;

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
  normalized_company_name: string | null;
  name_similarity_score: number | null;
};

function getMatchTokens(name: string): Set<string> {
  return new Set(
    name
      .split(/\s+/)
      .map((word) => word.trim())
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

  // Read queue in stable, bounded pages.
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("ipo_import_queue")
      .select(
        "id, source_name, company_name, ipo_type, normalized_company_name, name_similarity_score"
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

  // Build token index to avoid comparing every possible pair.
  const tokenIndex = new Map<string, number[]>();

  for (let i = 0; i < prepared.length; i++) {
    for (const token of prepared[i].tokens) {
      const existing = tokenIndex.get(token) || [];
      existing.push(i);
      tokenIndex.set(token, existing);
    }
  }

  const bestScores = new Map<string, number>();
  const candidatePairs = new Set<string>();

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
          "IPO matching exceeded its safe comparison limit. No metadata updates were performed."
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

      candidatePairs.add(
        [first.id, second.id].sort().join(":")
      );

      bestScores.set(
        first.id,
        Math.max(bestScores.get(first.id) || 0, score)
      );

      bestScores.set(
        second.id,
        Math.max(bestScores.get(second.id) || 0, score)
      );
    }
  }

  // Prepare metadata updates only when values have changed.
  const updates = prepared.filter((record) => {
    const nextScore = bestScores.get(record.id) ?? null;

    return (
      record.normalized !== record.normalized_company_name ||
      nextScore !== record.name_similarity_score
    );
  });

  // Controlled concurrency avoids thousands of simultaneous requests.
  for (
    let i = 0;
    i < updates.length;
    i += UPDATE_CONCURRENCY
  ) {
    const batch = updates.slice(
      i,
      i + UPDATE_CONCURRENCY
    );

    const results = await Promise.all(
      batch.map((record) =>
        supabaseAdmin
          .from("ipo_import_queue")
          .update({
            normalized_company_name: record.normalized,
            name_similarity_score:
              bestScores.get(record.id) ?? null,
          })
          .eq("id", record.id)
      )
    );

    if (results.some((result) => result.error)) {
      throw new Error(
        "IPO matching metadata update failed."
      );
    }
  }

  const result = {
    processed: records.length,
    comparisons,
    updated: updates.length,
    candidatePairs: candidatePairs.size,
    recordsWithCandidates: bestScores.size,
    typeMismatchPairs,
    verified: 0,
    published: 0,
  };

  const { error: logError } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: "ipo_matching",
      status: "success",
      message:
        `Processed ${result.processed}; ` +
        `comparisons ${result.comparisons}; ` +
        `updated ${result.updated}; ` +
        `candidate pairs ${result.candidatePairs}; ` +
        `candidate records ${result.recordsWithCandidates}; ` +
        `type mismatches ${result.typeMismatchPairs}. ` +
        "Name matching only; no identity verification, candidate linking or publication performed.",
    });

  if (logError) {
    throw new Error(
      "IPO matching audit log could not be saved."
    );
  }

  return result;
}
