import "server-only";

import { createHash } from "crypto";
import pdfParse from "pdf-parse";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireApiRole } from "@/lib/require-api-role";
import { runIpoMatching } from "@/lib/run-ipo-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEBI_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15";

const SEBI_HOSTS = new Set(["www.sebi.gov.in", "sebi.gov.in"]);

const MAX_PDF_SIZE = 15 * 1024 * 1024;
const MAX_PDF_LINKS = 5;

type IpoType = "SME" | "Mainboard";

type AtomicSaveResult = {
  success?: boolean;
  queue_id?: string;
  queue_inserted?: boolean;
  queue_duplicate?: boolean;
  evidence_inserted?: boolean;
  evidence_duplicate?: boolean;
  evidence_status?: string;
};

type Filing = {
  companyName: string;
  title: string;
  filingDate: string;
  sourceUrl: string;
};

type DocumentResult = {
  pdfUrl: string | null;
  ipoType: IpoType | null;
  status: string;
  signals: string[];
  pdfHash: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function validDate(year: number, month: number, day: number): boolean {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): string | null {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
    }
  }

  const monthFirst = value.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i
  );

  if (monthFirst) {
    const month = months[monthFirst[1].slice(0, 3).toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
    }
  }

  const dayFirst = value.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i
  );

  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = months[dayFirst[2].slice(0, 3).toLowerCase()];
    const year = Number(dayFirst[3]);

    if (validDate(year, month, day)) {
      return formatDate(year, month, day);
    }
  }

  return null;
}

function extractCompanyName(title: string): string {
  return cleanText(title)
    .replace(
      /\s*[-–—:]\s*(?:draft\s+)?(?:abridged\s+)?(?:red\s+herring\s+)?prospectus\b[\s\S]*$/i,
      ""
    )
    .replace(
      /\s*[\[(]?\s*(?:U?DRHP|RHP)(?:[-\s]*I{1,3})?\s*[\])]?(?:\s*advertisement)?[\s\S]*$/i,
      ""
    )
    .replace(
      /\s*[-–—:]\s*(?:addendum|corrigendum).*$/i,
      ""
    )
    .trim();
}

function isValidFilingTitle(title: string): boolean {
  if (!/\b(?:U?DRHP)\b|Draft Red Herring/i.test(title)) {
    return false;
  }

  if (/addendum|corrigendum/i.test(title)) {
    return false;
  }

  return true;
}

function isValidSebiUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    SEBI_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname.startsWith("/filings/public-issues/")
  );
}

function isValidSebiPdfUrl(url: URL): boolean {
  const allowedPath =
    url.pathname.startsWith("/sebi_data/attachdocs/") ||
    url.pathname.startsWith("/filings/public-issues/");

  return (
    url.protocol === "https:" &&
    SEBI_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.pathname.toLowerCase().endsWith(".pdf") &&
    allowedPath
  );
}

function extractPdfLinks(html: string, baseUrl: string): string[] {
  const links = [
    ...html.matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    ),
  ];

  const results = new Set<string>();

  for (const link of links) {
    try {
      const url = new URL(link[1], baseUrl);

      if (!isValidSebiPdfUrl(url)) continue;

      results.add(url.href);

      if (results.size >= MAX_PDF_LINKS) break;
    } catch {
      continue;
    }
  }

  return [...results];
}

function classifyIpoType(text: string): {
  ipoType: IpoType | null;
  signals: string[];
} {
  const normalized = text.replace(/\s+/g, " ").toUpperCase();

  const smePatterns = [
    /\bNSE\s*EMERGE\b/g,
    /\bBSE\s*SME\b/g,
    /\bSME\s+(?:PLATFORM|EXCHANGE|SEGMENT)\b/g,
    /\b(?:PLATFORM|EXCHANGE|SEGMENT)\s+(?:OF|FOR)\s+(?:THE\s+)?SME\b/g,
  ];

  const mainboardPatterns = [
    /\bMAIN\s*BOARD\s+(?:OF\s+)?(?:THE\s+)?(?:NATIONAL\s+STOCK\s+EXCHANGE|NSE|BSE)\b/g,
    /\b(?:NATIONAL\s+STOCK\s+EXCHANGE|NSE|BSE)\b.{0,100}\bMAIN\s*BOARD\b/g,
    /\bMAIN\s+BOARD\s+SEGMENT\b/g,
  ];

  const smeSignals: string[] = [];
  const mainboardSignals: string[] = [];

  for (const pattern of smePatterns) {
    const matches = normalized.match(pattern);
    if (matches) smeSignals.push(...matches);
  }

  for (const pattern of mainboardPatterns) {
    const matches = normalized.match(pattern);
    if (matches) mainboardSignals.push(...matches);
  }

  if (smeSignals.length > 0 && mainboardSignals.length > 0) {
    return {
      ipoType: null,
      signals: [...smeSignals, ...mainboardSignals],
    };
  }

  if (smeSignals.length > 0) {
    return {
      ipoType: "SME",
      signals: [...new Set(smeSignals)],
    };
  }

  if (mainboardSignals.length > 0) {
    return {
      ipoType: "Mainboard",
      signals: [...new Set(mainboardSignals)],
    };
  }

  return {
    ipoType: null,
    signals: [],
  };
}

async function fetchDocumentClassification(
  filingUrl: string
): Promise<DocumentResult> {
  const emptyResult: DocumentResult = {
    pdfUrl: null,
    ipoType: null,
    status: "document_not_found",
    signals: [],
    pdfHash: null,
  };

  try {
    const pageResponse = await fetch(filingUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Capital360IPO/1.0)",
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://www.sebi.gov.in/",
      },
    });

    if (!pageResponse.ok) return emptyResult;

    const pageSize = Number(
      pageResponse.headers.get("content-length") || 0
    );

    if (pageSize > 3 * 1024 * 1024) {
      return { ...emptyResult, status: "detail_page_too_large" };
    }

    const html = await pageResponse.text();

    if (!html || html.length > 3 * 1024 * 1024) {
      return { ...emptyResult, status: "invalid_detail_page" };
    }

    const pdfLinks = extractPdfLinks(html, filingUrl);

    if (pdfLinks.length === 0) {
      return emptyResult;
    }

    const detectedTypes: IpoType[] = [];
    const allSignals: string[] = [];
    let selectedPdfUrl: string | null = null;
    let selectedPdfHash: string | null = null;

    for (const pdfUrl of pdfLinks) {
      try {
        const pdfResponse = await fetch(pdfUrl, {
          method: "GET",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Capital360IPO/1.0)",
            Accept: "application/pdf,application/octet-stream",
            Referer: "https://www.sebi.gov.in/",
          },
        });

        if (!pdfResponse.ok) continue;

        const contentLength = Number(
          pdfResponse.headers.get("content-length") || 0
        );

        if (contentLength > MAX_PDF_SIZE) continue;

        const buffer = Buffer.from(await pdfResponse.arrayBuffer());

        if (
          buffer.length < 8 ||
          buffer.length > MAX_PDF_SIZE ||
          buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
        ) {
          continue;
        }

        const parsed = await pdfParse(buffer);
        const pdfText = parsed.text.slice(0, 2_000_000);

        const classification = classifyIpoType(pdfText);

        if (classification.ipoType) {
          detectedTypes.push(classification.ipoType);
          allSignals.push(...classification.signals);

          if (!selectedPdfUrl) {
            selectedPdfUrl = pdfUrl;
            selectedPdfHash = sha256(buffer);
          }
        }
      } catch (error) {
        console.error(
          "SEBI PDF extraction failed:",
          error instanceof Error ? error.message : "Unknown PDF error"
        );
      }
    }

    const uniqueTypes = [...new Set(detectedTypes)];

    if (uniqueTypes.length === 1 && selectedPdfUrl) {
      return {
        pdfUrl: selectedPdfUrl,
        ipoType: uniqueTypes[0],
        status: "type_detected",
        signals: [...new Set(allSignals)],
        pdfHash: selectedPdfHash,
      };
    }

    if (uniqueTypes.length > 1) {
      return {
        pdfUrl: selectedPdfUrl,
        ipoType: null,
        status: "conflicting_document_signals",
        signals: [...new Set(allSignals)],
        pdfHash: selectedPdfHash,
      };
    }

    return {
      pdfUrl: pdfLinks[0],
      ipoType: null,
      status: "pdf_found_type_not_explicit",
      signals: [],
      pdfHash: null,
    };
  } catch (error) {
    console.error(
      "SEBI document fetch failed:",
      error instanceof Error ? error.message : "Unknown document error"
    );

    return {
      ...emptyResult,
      status: "document_fetch_failed",
    };
  }
}

async function saveCollectionRecord(
  queuePayload: object,
  evidencePayload: object
): Promise<AtomicSaveResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "save_ipo_collection_record",
    {
      p_queue: queuePayload as never,
      p_evidence: evidencePayload as never,
    }
  );

  if (error) {
    throw new Error(`SEBI atomic collection failed: ${error.message}`);
  }

  const result = data as AtomicSaveResult | null;

  if (!result || result.success !== true || !result.queue_id) {
    throw new Error("SEBI atomic RPC returned an invalid result.");
  }

  return result;
}

async function writeLog(
  taskName: string,
  status: "success" | "failed",
  message: string
) {
  const { error } = await supabaseAdmin
    .from("automation_logs")
    .insert({
      task_name: taskName,
      status,
      message: message.slice(0, 500),
    });

  if (error) {
    console.error(
      `Automation log failed (${taskName}):`,
      error.message
    );
  }
}

async function collectIpos() {
  try {
    const response = await fetch(SEBI_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Capital360IPO/1.0)",
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://www.sebi.gov.in/",
      },
    });

    if (!response.ok) {
      throw new Error(`SEBI returned HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!html || html.length < 500) {
      throw new Error("SEBI returned an empty or incomplete page.");
    }

    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

    const filings = new Map<string, Filing>();

    for (const row of rows) {
      const rowText = cleanText(row);
      const filingDate = parseDate(rowText);

      if (!filingDate) continue;

      const links = [
        ...row.matchAll(
          /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        ),
      ];

      for (const link of links) {
        const title = cleanText(link[2]);

        if (!isValidFilingTitle(title)) continue;

        const companyName = extractCompanyName(title);

        if (!companyName || companyName.length < 3) continue;

        let sourceUrl: URL;

        try {
          sourceUrl = new URL(link[1], SEBI_URL);
        } catch {
          continue;
        }

        if (!isValidSebiUrl(sourceUrl)) continue;

        filings.set(sourceUrl.href, {
          companyName,
          title,
          filingDate,
          sourceUrl: sourceUrl.href,
        });
      }
    }

    if (filings.size === 0) {
      throw new Error(
        `No DRHP records parsed. HTML length: ${html.length}; rows found: ${rows.length}.`
      );
    }

    let detected = 0;
    let inserted = 0;
    let duplicates = 0;
    let evidenceInserted = 0;
    let evidenceDuplicates = 0;
    let documentFound = 0;
    let typeDetected = 0;
    let typeMissing = 0;
    let typeUpdated = 0;
    let documentErrors = 0;

    for (const filing of filings.values()) {
      detected++;

      // Official SEBI document extraction.
      const document = await fetchDocumentClassification(
        filing.sourceUrl
      );

      if (document.pdfUrl) documentFound++;
      if (document.ipoType) typeDetected++;
      else typeMissing++;

      if (
        document.status === "document_fetch_failed" ||
        document.status === "document_not_found"
      ) {
        documentErrors++;
      }

      const queueHash = sha256(`SEBI|${filing.sourceUrl}`);

      const evidenceHash = sha256(
        [
          "SEBI",
          "DRHP_FILING_LISTING",
          filing.sourceUrl,
          filing.filingDate,
          filing.title,
        ].join("|")
      );

      const collectedAt = new Date().toISOString();

      const queuePayload = {
        source_name: "SEBI",
        source_url: filing.sourceUrl,
        external_id: filing.sourceUrl,
        company_name: filing.companyName,
        ipo_type: document.ipoType,
        drhp_filed_date: filing.filingDate,
        detected_status: "drhp_filed",
        raw_payload: {
          title: filing.title,
          filing_date: filing.filingDate,
          source_url: filing.sourceUrl,
          source: "SEBI",
          document_url: document.pdfUrl,
          document_status: document.status,
          detected_ipo_type: document.ipoType,
        },
        content_hash: queueHash,
        review_status: "pending",
        collected_at: collectedAt,
      };

      const listingEvidence = {
        source_name: "SEBI",
        source_url: filing.sourceUrl,
        evidence_type: "drhp_filing_listing",
        field_name: "drhp_filed_date",
        field_value: filing.filingDate,
        issuer_name: filing.companyName,
        is_official_source: true,
        content_hash: evidenceHash,
        observed_at: collectedAt,
        metadata: {
          title: filing.title,
          listing_page: SEBI_URL,
          evidence_scope:
            "SEBI listing entry detected; document contents are separate evidence.",
        },
      };

      // Save listing and its evidence atomically.
      const result = await saveCollectionRecord(
        queuePayload,
        listingEvidence
      );

      if (result.queue_inserted === true) inserted++;
      else duplicates++;

      if (result.evidence_inserted === true) evidenceInserted++;
      else evidenceDuplicates++;

      // Save separate official PDF evidence.
      if (document.pdfUrl) {
        const hasVerifiedType = document.ipoType !== null;

        const documentEvidence = {
          source_name: "SEBI",
          source_url: document.pdfUrl,
          evidence_type: hasVerifiedType
            ? "drhp_document_ipo_type"
            : "drhp_document",
          field_name: hasVerifiedType ? "ipo_type" : "document_url",
          field_value: hasVerifiedType
            ? document.ipoType
            : document.pdfUrl,
          issuer_name: filing.companyName,
          is_official_source: true,
          content_hash: sha256(
            [
              "SEBI",
              "DRHP_DOCUMENT",
              document.pdfUrl,
              document.pdfHash || "unclassified",
              document.status,
            ].join("|")
          ),
          observed_at: collectedAt,
          metadata: {
            listing_page: filing.sourceUrl,
            document_url: document.pdfUrl,
            document_status: document.status,
            detected_ipo_type: document.ipoType,
            classification_signals: document.signals,
            pdf_sha256: document.pdfHash,
            classification_method: "explicit_official_pdf_text_only",
          },
        };

        const documentSave = await saveCollectionRecord(
          queuePayload,
          documentEvidence
        );

        if (documentSave.evidence_inserted === true) {
          evidenceInserted++;
        } else {
          evidenceDuplicates++;
        }

        // Existing pending rows may have NULL type.
        // Never overwrite a non-null value or reviewed queue record.
        if (document.ipoType) {
          const { data: updatedRows, error: updateError } =
            await supabaseAdmin
              .from("ipo_import_queue")
              .update({ ipo_type: document.ipoType })
              .eq("id", result.queue_id)
              .eq("review_status", "pending")
              .is("ipo_type", null)
              .select("id");

          if (updateError) {
            console.error(
              "Pending IPO type update failed:",
              updateError.message
            );
          } else if (updatedRows && updatedRows.length > 0) {
            typeUpdated++;
          }
        }
      }
    }

    const collectionMessage =
      `Detected: ${detected}, Inserted: ${inserted}, ` +
      `Duplicates: ${duplicates}, Evidence inserted: ${evidenceInserted}, ` +
      `Evidence duplicates: ${evidenceDuplicates}, ` +
      `PDF found: ${documentFound}, IPO types detected: ${typeDetected}, ` +
      `IPO types missing: ${typeMissing}, Pending types updated: ${typeUpdated}`;

    let matchingResult: unknown = null;
    let matchingError: string | null = null;

    try {
      matchingResult = await runIpoMatching();
    } catch (error) {
      matchingError =
        error instanceof Error
          ? error.message
          : "Unknown matching error";

      console.error("IPO matching dry run failed:", matchingError);

      await writeLog(
        "SEBI IPO Matching Dry Run",
        "failed",
        matchingError
      );
    }

    await writeLog(
      "SEBI IPO DRHP Collection",
      "success",
      collectionMessage
    );

    return jsonResponse({
      success: true,
      status: matchingError ? "partial_success" : "success",
      collection: {
        success: true,
        detected,
        inserted,
        duplicates,
        evidenceInserted,
        evidenceDuplicates,
        documentFound,
        typeDetected,
        typeMissing,
        typeUpdated,
        documentErrors,
        message: collectionMessage,
      },
      matching: {
        success: !matchingError,
        status: matchingError ? "failed" : "completed",
        mode: "dry_run",
        result: matchingResult,
        error: matchingError,
      },
      review_status: "pending",
      evidence_status: "unverified",
      automatic_verification: false,
      automatic_publication: false,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown collection error";

    console.error("IPO collection failed:", message);

    await writeLog(
      "SEBI IPO DRHP Collection",
      "failed",
      message
    );

    return jsonResponse(
      {
        success: false,
        status: "failed",
        error: "IPO collection failed. Check server logs.",
      },
      502
    );
  }
}

// Manual collection: Owner/Admin only.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== request.nextUrl.origin) {
    return jsonResponse(
      { success: false, error: "Invalid request origin." },
      403
    );
  }

  try {
    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
    }

    return await collectIpos();
  } catch (error) {
    console.error("Manual IPO collection authorization failed:", error);

    return jsonResponse(
      {
        success: false,
        error: "Unable to authorize collection request.",
      },
      500
    );
  }
}

// Automatic collection: Vercel Cron only.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return jsonResponse(
      { success: false, error: "Unauthorized cron request." },
      401
    );
  }

  return collectIpos();
}
