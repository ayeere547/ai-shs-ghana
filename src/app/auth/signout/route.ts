import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** POST-only so a third-party page cannot sign users out with a simple link or image tag. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.rpc("log_audit", { p_action: "auth.sign_out", p_entity_type: "session" });
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
