import { FeastShell } from "@/components/feast/feast-shared";
import { FeastRegister } from "@/components/feast/feast-register";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <FeastShell>
      {/* Centred column: forms read badly stretched across a laptop screen. */}
      <div className="mx-auto w-full max-w-[1000px]">
        <FeastRegister slug={slug} />
      </div>
    </FeastShell>
  );
}
