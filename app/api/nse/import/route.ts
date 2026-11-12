
import "server-only";

import { gunzipSync } from "fflate";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "nse-imports";
const CHUNK_SIZE = 300;
const EXPECTED_COLUMNS = 120;

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (quoted) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];
    } else {
      field += ch;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("CSV contains no data records.");
  }

  const headers = rows[0].map((value, index) =>
    index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim()
  );

  if (headers.length !== EXPECTED_COLUMNS) {
    throw new Error(
      `Expected ${EXPECTED_COLUMNS} columns, found ${headers.length}.`
    );
  }

  if (headers.some((value) => !value)) {
    throw new Error("CSV contains an empty column heading.");
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV contains duplicate column headings.");
  }

  const records = rows.slice(1);

  const invalidIndex = records.findIndex(
    (record) => record.length !== headers.length
  );

  if (invalidIndex !== -1) {
    throw new Error(
      `Invalid column count in CSV record ${invalidIndex + 2}.`
    );
  }

  return { headers, records };
}

export async function POST(request: Request) {
  let batchId: string | null = null;

  try {
    // 1. Authenticate user
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

    // 3. Read batch ID
    const body = await request.json();
    batchId = body.batch_id;

    if (
      typeof batchId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)
    ) {
      return NextResponse.json(
        { success: false, error: "Valid batch_id is required." },
        { status: 400 }
      );
    }

    // 4. Get import batch
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("nse_import_batches")
      .select("id, status, inserted_rows, total_rows, metadata")
      .eq("id", batchId)
      .maybeSingle();

    if (batchError) throw batchError;

    if (!batch) {
      return NextResponse.json(
        { success: false, error: "Import batch not found." },
        { status: 404 }
      );
    }

    if (batch.status === "completed") {
      return NextResponse.json({
        success: true,
        completed: true,
        message: "This import batch is already completed.",
        inserted_rows: batch.inserted_rows,
        total_rows: batch.total_rows,
      });
    }

    if (!["pending", "processing", "failed"].includes(batch.status)) {
      return NextResponse.json(
        { success: false, error: "Invalid batch status." },
        { status: 409 }
      );
    }

    const metadata =
      batch.metadata as Record<string, unknown>;

    const storagePath = metadata?.storage_path;

    if (typeof storagePath !== "string" || !storagePath.startsWith("nse/")) {
      throw new Error("Valid storage path is missing from batch metadata.");
    }

    // 5. Download private file
    const { data: file, error: downloadError } =
      await supabaseAdmin.storage
        .from(BUCKET)
        .download(storagePath);

    if (downloadError || !file) {
      throw new Error(
        downloadError?.message || "Could not download NSE file."
      );
    }

    // 6. Decompress gzip
    const compressedBytes = new Uint8Array(
      await file.arrayBuffer()
    );

    const csvBytes = gunzipSync(compressedBytes);

    const csvText = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(csvBytes);

    // 7. Parse and validate CSV
    const { headers, records } = parseCsv(csvText);

    const totalRows = records.length;
    const start = batch.inserted_rows;

    if (start > totalRows) {
      throw new Error("Saved import progress exceeds total CSV records.");
    }

    // 8. If all records are already processed
    if (start === totalRows) {
      const { error: completeError } = await supabaseAdmin
        .from("nse_import_batches")
        .update({
          status: "completed",
          total_rows: totalRows,
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId)
        .eq("inserted_rows", start);

      if (completeError) throw completeError;

      return NextResponse.json({
        success: true,
        completed: true,
        inserted_rows: start,
        total_rows: totalRows,
      });
    }

    // 9. Prepare one chunk
    const chunk = records.slice(start, start + CHUNK_SIZE);

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

    // 10. Insert idempotently
    const { error: insertError } = await supabaseAdmin
      .from("nse_security_master_raw")
      .upsert(payload, {
        onConflict: "import_batch_id,source_row_number",
        ignoreDuplicates: true,
      });

    if (insertError) throw insertError;

    const nextOffset = start + chunk.length;
    const completed = nextOffset >= totalRows;

    // 11. Save progress with optimistic concurrency check
    const { data: updatedBatch, error: progressError } =
      await supabaseAdmin
        .from("nse_import_batches")
        .update({
          status: completed ? "completed" : "processing",
          total_rows: totalRows,
          inserted_rows: nextOffset,
          ...(completed
            ? { completed_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", batchId)
        .eq("inserted_rows", start)
        .select("id")
        .maybeSingle();

    if (progressError) throw progressError;

    if (!updatedBatch) {
      return NextResponse.json(
        {
          success: false,
          error: "Import progress changed concurrently. Retry the batch.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      completed,
      batch_id: batchId,
      processed_this_request: chunk.length,
      inserted_rows: nextOffset,
      total_rows: totalRows,
      remaining_rows: totalRows - nextOffset,
      progress_percent: Math.round(
        (nextOffset / totalRows) * 100
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error.";

    console.error("NSE chunk import error:", message);

    if (batchId) {
      await supabaseAdmin
        .from("nse_import_batches")
        .update({
          status: "failed",
          metadata: {
            error: message,
          },
        })
        .eq("id", batchId)
        .eq("status", "processing");
    }

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
