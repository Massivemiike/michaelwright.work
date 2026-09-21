// src/lib/supabase/server.ts
//
// Service-role Supabase client — the ONLY write credential for game_scores,
// and structurally the only write path (RLS has no client insert/update/
// delete policy; the service role bypasses RLS). `import "server-only"`
// makes it a build error to import this from any client bundle; the key is
// never NEXT_PUBLIC_, never logged, and only reached from the nodejs route
// handler and Server Component reads.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getServiceClient(): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase env missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_)."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
