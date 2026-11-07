
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeCompanyName,
  calculateCompanyNameSimilarity,
  isStrongCompanyNameMatch,
} from "@/lib/ipo-matching";

const PAGE_SIZE = 500;
const MAX_RECORDS = 5000;
const UPDATE_BATCH_SIZE = 100;

type QueueRecord = {
  id: string;
  source_name: string;
  company_name: string;
  ipo_type: string | null;
};

export async function runIpoMatching() {
  const records: QueueRecord[] = [];
  let offset = 0;

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

  const prepared = records.map((record) => ({
    ...record,
    normalized: normalizeCompanyName(record.company_name),
  }));

  const bestScores = new Map<string, number>();
  const candidatePairs = new Set<string>();
  let typeMismatchPairs = 0;

  for (let i = 0; i < prepared.length; i++) {
    const first = prepared[i];

    if (!first.normalized) continue;

    for (let j = i + 1; j < prepared.length; j++) {
      const second = prepared[j];

      if (
        !second.normalized ||
        first.source_name === second.source_name
      ) {
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

      if (
        first.ipo_type &&
        second.ipo_type &&
        first.ipo_type !== second.ipo_type
      ) {
        typeMismatchPairs++;
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

  for (
    let i = 0;
    i < prepared.length;
    i += UPDATE_BATCH_SIZE
  ) {
    const batch = prepared.slice(i, i + UPDATE_BATCH_SIZE);

    for (const record of batch) {
      const { error } = await supabaseAdmin
        .from("ipo_import_queue")
        .update({
          normalized_company_name: record.normalized,
          name_similarity_score:
            bestScores.get(record.id) ?? null,
        })
        .eq("id", record.id);

      if (error) {
        throw new Error(
          "IPO matching metadata update failed."
        );
      }
    }
  }

  const result = {
    processed: records.length,
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
        `candidate pairs ${result.candidatePairs}; ` +
        `candidate records ${result.recordsWithCandidates}; ` +
        `type mismatches ${result.typeMismatchPairs}. ` +
        "Name matching only; no verification or publication performed.",
    });

  if (logError) {
    throw new Error("IPO matching audit log could not be saved.");
  }

  return result;
}
