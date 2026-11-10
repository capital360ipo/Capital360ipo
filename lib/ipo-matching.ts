/**
 * Capital360IPO — Safe Company Matching Engine
 *
 * Name similarity is only a candidate signal.
 * It never independently verifies or publishes an IPO.
 */

const GENERIC_WORDS = new Set([
  "private", "limited", "ltd", "pvt", "incorporated", "inc",
  "corporation", "corp", "company", "co", "india", "indian",
  "industries", "industry", "technology", "technologies",
  "solutions", "services", "international", "global", "ventures",
  "enterprise", "enterprises", "holdings", "group",
]);

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(private limited|private ltd|pvt limited|pvt ltd|limited|ltd|incorporated|inc|corporation|corp|company|co)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDistinctiveWords(name: string): Set<string> {
  return new Set(
    normalizeCompanyName(name)
      .split(" ")
      .filter(
        (word) => word.length >= 3 && !GENERIC_WORDS.has(word)
      )
  );
}

export function calculateCompanyNameSimilarity(
  firstName: string,
  secondName: string
): number {
  const first = normalizeCompanyName(firstName);
  const second = normalizeCompanyName(secondName);

  if (!first || !second) return 0;

  const firstWords = getDistinctiveWords(first);
  const secondWords = getDistinctiveWords(second);

  // Generic-only names cannot produce a match.
  if (!firstWords.size || !secondWords.size) return 0;

  if (first === second) return 100;

  const commonWords = [...firstWords].filter((word) =>
    secondWords.has(word)
  ).length;

  return Math.round(
    (2 * commonWords / (firstWords.size + secondWords.size)) * 100
  );
}

/**
 * Strong name signal only.
 * This is NOT proof of company identity.
 */
export function isStrongCompanyNameMatch(
  firstName: string,
  secondName: string
): boolean {
  const first = normalizeCompanyName(firstName);
  const second = normalizeCompanyName(secondName);

  if (!first || !second) return false;

  const firstWords = getDistinctiveWords(first);
  const secondWords = getDistinctiveWords(second);

  if (!firstWords.size || !secondWords.size) return false;

  if (first === second) return true;

  const commonWords = [...firstWords].filter((word) =>
    secondWords.has(word)
  );

  if (!commonWords.length) return false;

  return calculateCompanyNameSimilarity(first, second) >= 90;
}
