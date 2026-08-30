import { FeastShell } from "@/components/feast/feast-shared";
import { FeastRegister } from "@/components/feast/feast-register";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      <FeastRegister slug={slug} />
    </FeastShell>
  );
}
