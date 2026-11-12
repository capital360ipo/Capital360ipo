
import "server-only";

import { createHash } from "crypto";
import { gunzipSync } from "fflate";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const EXPECTED_COLUMNS = 120;
const INSERT_BATCH_SIZE = 300;

type CsvResult = {
  headers: string[];
  records: string[][];
};

// CSV parser: quoted commas, escaped quotes and multiline fields supported.
function parseCsv(csv: string): CsvResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("CSV does not contain any data records.");
  }

  const headers = rows[0].map((header, index) => {
    const value = index === 0
      ? header.replace(/^\uFEFF/, "")
      : header;

    return value.trim();
  });

  return {
    headers,
    records: rows.slice(1),
  };
}

function getFileDate(fileName: string): string | null {
  const match = fileName.match(/_(\d{2})(\d{2})(\d{4})/);

  if (!match) return null;

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

export async function POST(request: Request) {
  let batchId: string | null = null;

  try {
    // 1. Verify logged-in user
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    // 2. Verify owner role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Owner permission required." },
        { status: 403 }
      );
    }

    // 3. Read uploaded file
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Please upload a CSV.GZ file." },
        { status: 400 }
      );
    }

    const fileName = file.name;

    if (!fileName.toLowerCase().endsWith(".csv.gz")) {
      return NextResponse.json(
        { success: false, error: "Only .csv.gz files are accepted." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File must be between 1 byte and 4 MB." },
        { status: 413 }
      );
    }

    const compressedBytes = Buffer.from(await file.arrayBuffer());

    // 4. Calculate SHA-256
    const fileHash = createHash("sha256")
      .update(compressedBytes)
      .digest("hex");

    // 5. Prevent duplicate imports
    const { data: existingBatch, error: duplicateError } =
      await supabaseAdmin
        .from("nse_import_batches")
        .select("id, status, file_name")
        .eq("file_sha256", fileHash)
        .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (existingBatch) {
      return NextResponse.json(
        {
          success: false,
          duplicate: true,
          message: "This exact file has already been imported.",
          existingBatch,
        },
        { status: 409 }
      );
    }

    // 6. Decompress gzip
    let csvText: string;

    try {
      const decompressed = gunzipSync(
        new Uint8Array(compressedBytes)
      );

      csvText = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(decompressed);
    } catch {
      throw new Error("Gzip decompression failed. Check the file.");
    }

    // 7. Parse CSV
    const { headers, records } = parseCsv(csvText);

    if (headers.length !== EXPECTED_COLUMNS) {
      throw new Error(
        `Expected ${EXPECTED_COLUMNS} columns, found ${headers.length}.`
      );
    }

    if (headers.some((header) => !header)) {
      throw new Error("CSV contains an empty column heading.");
    }

    if (new Set(headers).size !== headers.length) {
      throw new Error("CSV contains duplicate column headings.");
    }

    const invalidRow = records.findIndex(
      (record) => record.length !== headers.length
    );

    if (invalidRow !== -1) {
      throw new Error(
        `CSV record ${invalidRow + 2} has an incorrect column count.`
      );
    }

    // 8. Create import batch
    const { data: batch, error: batchError } =
      await supabaseAdmin
        .from("nse_import_batches")
        .insert({
          source_name: "NSE",
          file_name: fileName,
          file_date: getFileDate(fileName),
          file_sha256: fileHash,
          status: "processing",
          total_rows: records.length,
          started_at: new Date().toISOString(),
          metadata: {
            file_size_bytes: file.size,
            column_count: headers.length,
            uploaded_by: user.id,
          },
        })
        .select("id")
        .single();

    if (batchError) throw batchError;

    batchId = batch.id;

    // 9. Insert original records in batches
    let insertedRows = 0;

    for (
      let start = 0;
      start < records.length;
      start += INSERT_BATCH_SIZE
    ) {
      const chunk = records.slice(
        start,
        start + INSERT_BATCH_SIZE
      );

      const payload = chunk.map((record, index) => {
        const rawRecord: Record<string, string> = {};

        headers.forEach((header, columnIndex) => {
          rawRecord[header] = record[columnIndex];
        });

        return {
          import_batch_id: batchId,
          source_row_number: start + index + 2,
          raw_record: rawRecord,
        };
      });

      const { error: insertError } = await supabaseAdmin
        .from("nse_security_master_raw")
        .insert(payload);

      if (insertError) {
        throw new Error(
          `Database insert failed near record ${start + 2}: ${insertError.message}`
        );
      }

      insertedRows += payload.length;
    }

    // 10. Mark import completed
    const { error: updateError } = await supabaseAdmin
      .from("nse_import_batches")
      .update({
        status: "completed",
        inserted_rows: insertedRows,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "NSE Security Master imported successfully.",
      batch_id: batchId,
      file_name: fileName,
      total_rows: records.length,
      inserted_rows: insertedRows,
      columns: headers.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error.";

    if (batchId) {
      await supabaseAdmin
        .from("nse_import_batches")
        .update({
          status: "failed",
          error_rows: 1,
          metadata: {
            error: message,
          },
        })
        .eq("id", batchId);
    }

    console.error("NSE import error:", message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        batch_id: batchId,
      },
      { status: 500 }
    );
  }
}
