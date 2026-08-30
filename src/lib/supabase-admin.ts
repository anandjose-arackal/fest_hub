import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let _client: SupabaseClient | null = null;

// Never import this file into a client component — SUPABASE_SERVICE_ROLE_KEY
// has no NEXT_PUBLIC_ prefix and is server-only by Next.js convention;
// bundling it client-side would leak the key. Lazily instantiated so
// importing this module doesn't throw at build time before the key exists —
// it only throws when getSupabaseAdmin() is actually called.
export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }
    _client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}
