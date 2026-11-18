import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS — use only in server code, only after an explicit permission
 * check (requirePermission), and only for operations RLS cannot express (e.g. creating auth users).
 */
export function createAdminClient() {
  const { serviceRoleKey } = serverEnv();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(publicEnv.supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
