import { redirect } from "next/navigation";

// Team events are picked on the normal registration form now (one person at
// a time, joining their scope's team). Old links land there.
export default async function RegisterTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/feast/${slug}/register`);
}
