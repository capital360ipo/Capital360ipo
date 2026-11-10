
import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ApiRole = "owner" | "admin" | "editor" | "viewer";

export async function requireApiRole(
  allowedRoles: readonly ApiRole[]
) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { success: false, error: "Authentication required." },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("API role lookup failed:", profileError.message);

    return {
      authorized: false as const,
      response: NextResponse.json(
        { success: false, error: "Unable to verify permissions." },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      ),
    };
  }

  if (
    !profile ||
    !allowedRoles.includes(profile.role as ApiRole)
  ) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      ),
    };
  }

  return {
    authorized: true as const,
    user,
    profile,
    supabase,
  };
}
