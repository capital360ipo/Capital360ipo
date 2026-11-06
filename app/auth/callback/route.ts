
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");

  const next =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/account";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_invitation_link", requestUrl.origin)
    );
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=invitation_expired", requestUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL(next, requestUrl.origin)
  );
}
