import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** "Download my data" (Act 843 right of access). The database returns only the caller's own data. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_data_export");
  if (error || !data) return NextResponse.json({ error: "export unavailable" }, { status: 500 });
  await supabase.rpc("log_audit", { p_action: "account.data_exported", p_entity_type: "profile", p_entity_id: session.userId, p_summary: "Downloaded own data" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-shs-ghana-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
