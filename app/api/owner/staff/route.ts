import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const allowedRoles = ["admin", "editor", "viewer"] as const;

export async function POST(request: NextRequest) {
  try {
    // 1. Same-origin protection
    const origin = request.headers.get("origin");

    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

    // 2. JSON content validation
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "JSON request required." },
        { status: 415 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // 3. Verify authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // 4. Verify actual Owner role from database
    const { data: ownerProfile, error: ownerError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (ownerError || ownerProfile?.role !== "owner") {
      return NextResponse.json(
        { error: "Only the Owner can create staff accounts." },
        { status: 403 }
      );
    }

    // 5. Validate request body
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const payload = body as Record<string, unknown>;

    const email =
      typeof payload.email === "string"
        ? payload.email.trim().toLowerCase()
        : "";

    const fullName =
      typeof payload.full_name === "string"
        ? payload.full_name.trim()
        : "";

    const role = payload.role;

    if (!email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email address required." },
        { status: 400 }
      );
    }

    if (!fullName || fullName.length > 100) {
      return NextResponse.json(
        { error: "Valid full name required (maximum 100 characters)." },
        { status: 400 }
      );
    }

    if (
      typeof role !== "string" ||
      !allowedRoles.some((allowedRole) => allowedRole === role)
    ) {
      return NextResponse.json(
        { error: "Invalid role. Owner assignment is not allowed." },
        { status: 400 }
      );
    }

    // 6. Invite staff through trusted server-side Supabase client
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          account_type: "staff",
          full_name: fullName,
        },
        redirectTo: `${request.nextUrl.origin}/auth/callback?next=/set-password`,
      });

    if (inviteError || !inviteData.user) {
      return NextResponse.json(
        { error: inviteError?.message || "Staff invitation failed." },
        { status: 400 }
      );
    }

    // 7. Create staff profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: inviteData.user.id,
        full_name: fullName,
        role,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id);

      return NextResponse.json(
        { error: "Staff profile creation failed. Invitation was cancelled." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Staff invitation sent successfully.",
        role,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to process staff invitation." },
      { status: 500 }
    );
  }
}
