import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let alreadySetUp = false;
  try {
    const { count } = await getSupabaseAdmin()
      .from("profiles")
      .select("id", { count: "exact", head: true });
    alreadySetUp = (count ?? 0) > 0;
  } catch {
    // SUPABASE_SERVICE_ROLE_KEY not configured yet — let the form render so
    // the error surfaces clearly instead of a confusing redirect.
  }

  if (alreadySetUp) redirect("/admin/login");

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <SetupForm />
    </main>
  );
}
