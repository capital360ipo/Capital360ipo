
/**
 * Capital360IPO — Company Matching Engine
 *
 * Compares company names collected from different sources.
 * Name similarity alone never confirms an IPO or publishes data.
 */

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(
      /\b(private limited|private ltd|pvt limited|pvt ltd|limited|ltd|incorporated|inc|corporation|corp|company|co)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateCompanyNameSimilarity(
  firstName: string,
  secondName: string
): number {
  const first = normalizeCompanyName(firstName);
  const second = normalizeCompanyName(secondName);

  if (!first || !second) return 0;
  if (first === second) return 100;

  const firstWords = new Set(first.split(" "));
  const secondWords = new Set(second.split(" "));

  const commonWords = [...firstWords].filter((word) =>
    secondWords.has(word)
  ).length;

  const totalWords = firstWords.size + secondWords.size;

  if (totalWords === 0) return 0;

  return Math.round((2 * commonWords / totalWords) * 100);
}

/**
 * Returns whether a record is a strong name-match candidate.
 * A strong candidate still requires independent source verification.
 */
export function isStrongCompanyNameMatch(
  firstName: string,
  secondName: string
): boolean {
  const first = normalizeCompanyName(firstName);
  const second = normalizeCompanyName(secondName);

  if (!first || !second) return false;

  return calculateCompanyNameSimilarity(first, second) >= 90;
}
