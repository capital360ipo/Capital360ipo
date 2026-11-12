
import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const BUCKET_NAME = "nse-imports";

function getFileDate(fileName: string): string | null {
  const match = fileName.match(/_(\d{2})(\d{2})(\d{4})/);

  if (!match) return null;

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

export async function POST(request: Request) {
  try {
    // 1. Verify authentication
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
        { success: false, error: "Please select a file." },
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
        { success: false, error: "File must not exceed 4 MB." },
        { status: 413 }
      );
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());

    // 4. Verify gzip signature
    if (
      fileBytes.length < 2 ||
      fileBytes[0] !== 0x1f ||
      fileBytes[1] !== 0x8b
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid gzip file." },
        { status: 400 }
      );
    }

    // 5. Generate SHA-256
    const fileHash = createHash("sha256")
      .update(fileBytes)
      .digest("hex");

    // 6. Check duplicate file
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
          message: "This file has already been uploaded.",
          existingBatch,
        },
        { status: 409 }
      );
    }

    // 7. Create a safe storage path
    const storagePath = `nse/${fileHash}.csv.gz`;

    // 8. Upload to private Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBytes, {
        contentType: "application/gzip",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        `Private storage upload failed: ${uploadError.message}`
      );
    }

    // 9. Create import batch
    const { data: batch, error: batchError } =
      await supabaseAdmin
        .from("nse_import_batches")
        .insert({
          source_name: "NSE",
          file_name: fileName,
          file_date: getFileDate(fileName),
          file_sha256: fileHash,
          status: "pending",
          total_rows: 0,
          inserted_rows: 0,
          duplicate_rows: 0,
          error_rows: 0,
          metadata: {
            storage_bucket: BUCKET_NAME,
            storage_path: storagePath,
            file_size_bytes: file.size,
            uploaded_by: user.id,
            upload_status: "completed",
          },
        })
        .select("id, file_name, status, created_at")
        .single();

    if (batchError) {
      // Remove uploaded object if batch creation fails
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

      if (cleanupError) {
        console.error("Storage cleanup failed:", cleanupError.message);
      }

      throw batchError;
    }

    // 10. Return upload result
    return NextResponse.json({
      success: true,
      message: "NSE file uploaded securely.",
      batch_id: batch.id,
      file_name: batch.file_name,
      status: batch.status,
      storage_bucket: BUCKET_NAME,
      created_at: batch.created_at,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown upload error.";

    console.error("NSE upload error:", message);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
