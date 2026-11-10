import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/require-api-role";
import { runIpoLifecycleAssessment } from "@/lib/run-ipo-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { success: false, error: "Invalid request origin." },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "JSON request required." },
        {
          status: 415,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const auth = await requireApiRole(["owner", "admin"]);

    if (!auth.authorized) {
      return auth.response;
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
