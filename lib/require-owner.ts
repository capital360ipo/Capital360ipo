
import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function requireOwner() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Login session verify nahi hua to login par bhejo.
  if (authError || !user) {
    redirect("/login");
  }

  // Database se actual role verify karo.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // Verification fail ho to access deny karo.
  if (profileError || !profile || profile.role !== "owner") {
    redirect("/account");
  }

  return {
    user,
    profile,
    supabase,
  };
}
