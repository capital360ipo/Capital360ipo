
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { runIpoLifecycleAssessment } from "@/lib/run-ipo-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        { status: 403 }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "JSON request required." },
        { status: 415 }
      );
    }

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

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile ||
      !["owner", "admin"].includes(profile.role)
    ) {
      return NextResponse.json(
        { success: false, error: "Owner or Admin access required." },
        { status: 403 }
      );
    }

    const result = await runIpoLifecycleAssessment();

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("IPO lifecycle assessment failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "IPO lifecycle assessment failed. Check server logs.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
