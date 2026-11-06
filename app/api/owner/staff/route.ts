
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const allowedRoles = ["admin", "editor", "viewer"] as const;

export async function POST(request: NextRequest) {
  try {
    // Verify logged-in user
    const supabase = await createSupabaseServerClient();

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

    // Verify actual Owner role from database
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

    const body = await request.json();

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";

    const role = body.role;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid staff role. Owner assignment is not allowed here." },
        { status: 400 }
      );
    }

    // Send staff invitation
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

    // Create the staff profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: inviteData.user.id,
        full_name: fullName,
        role,
      });

    if (profileError) {
      // Roll back the invited Auth user if profile creation fails
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
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to process staff invitation." },
      { status: 500 }
    );
  }
}
