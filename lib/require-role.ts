
import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type StaffRole = "owner" | "admin" | "editor" | "viewer";

export async function requireRole(
  allowedRoles: readonly StaffRole[]
) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !allowedRoles.includes(profile.role as StaffRole)
  ) {
    redirect("/account");
  }

  return {
    user,
    profile,
    supabase,
  };
}
