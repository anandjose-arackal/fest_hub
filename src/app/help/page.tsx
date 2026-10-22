import type { Metadata } from "next";
import { FeastShell } from "@/components/feast/feast-shared";
import { HelpPage } from "@/components/feast/help/help-page";

export const metadata: Metadata = {
  title: "Help",
  description: "Step-by-step guides for registering participants, finding results and sharing them.",
};

export default function Help() {
  return (
    <FeastShell>
      <HelpPage />
    </FeastShell>
  );
}
