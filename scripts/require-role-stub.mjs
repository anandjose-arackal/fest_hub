// Stand-in for "@/lib/require-role" when server actions run from a plain Node
// script (publish-feast-results.mjs). There's no request, so no fh-at cookie
// to check — and the script already holds the service-role key from
// .env.local, which is full database access anyway. Acts as an admin.
export const AUTH_COOKIE = "fh-at";

export async function requireRole() {
  return { userId: "local-script", role: "admin" };
}
