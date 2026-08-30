"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CertificateField, CertificateRosterRow, CertificateTemplate } from "@/types";

// certificate_templates has no RLS (no public consumer — only this file's
// actions and the admin designer page touch it), so every read/write here
// goes through the service-role client, same convention as
// shakha_feast_standings / competition_results.

export async function getCertificateTemplate(feastId: string): Promise<{ data?: CertificateTemplate | null; error?: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("certificate_templates")
    .select("feast_id, paper_width_mm, paper_height_mm, background_image_url, fields, created_at, updated_at")
    .eq("feast_id", feastId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { data: data as CertificateTemplate | null };
}

export interface SaveCertificateTemplateInput {
  feastId: string;
  paperWidthMm: number;
  paperHeightMm: number;
  backgroundImageUrl: string;
  fields: CertificateField[];
}

export async function saveCertificateTemplate(input: SaveCertificateTemplateInput): Promise<{ error?: string }> {
  if (!(input.paperWidthMm > 0) || !(input.paperHeightMm > 0)) {
    return { error: "Paper width and height must be positive." };
  }
  const { error } = await getSupabaseAdmin()
    .from("certificate_templates")
    .upsert(
      {
        feast_id: input.feastId,
        paper_width_mm: input.paperWidthMm,
        paper_height_mm: input.paperHeightMm,
        background_image_url: input.backgroundImageUrl,
        fields: input.fields,
      },
      { onConflict: "feast_id" }
    );
  if (error) return { error: error.message };
  return {};
}

// Every participant with a published result across the whole feast — one
// row per individual result, and (per product decision) one row per member
// of every published team result, so each teammate gets their own printed
// certificate while sharing the team's place/grade/shakha.
export async function getCertificateRoster(feastId: string): Promise<{ data?: CertificateRosterRow[]; error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: fcs, error: fcErr } = await admin
    .from("feast_competitions")
    .select("id, competition:competitions(name)")
    .eq("feast_id", feastId)
    .eq("result_status", "published");
  if (fcErr) return { error: fcErr.message };
  if (!fcs || fcs.length === 0) return { data: [] };

  const compNameByFc = new Map<string, string>();
  for (const fc of fcs) {
    const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    compNameByFc.set(fc.id, competition?.name ?? "Competition");
  }
  const fcIds = fcs.map((f) => f.id);

  const rows: CertificateRosterRow[] = [];

  const { data: indivResults, error: indivErr } = await admin
    .from("competition_results")
    .select(
      "feast_competition_id, grade, position, participant_registration:participant_registrations(participant:participants(name, shakha:shakhas(name)))"
    )
    .in("feast_competition_id", fcIds)
    .not("published_at", "is", null);
  if (indivErr) return { error: indivErr.message };

  for (const r of indivResults ?? []) {
    const partReg = Array.isArray(r.participant_registration) ? r.participant_registration[0] : r.participant_registration;
    const participant = Array.isArray(partReg?.participant) ? partReg?.participant[0] : partReg?.participant;
    const shakha = Array.isArray(participant?.shakha) ? participant?.shakha[0] : participant?.shakha;
    if (!participant) continue;
    rows.push({
      name: participant.name,
      shakhaName: shakha?.name ?? "—",
      competitionName: compNameByFc.get(r.feast_competition_id) ?? "Competition",
      place: r.position,
      grade: r.grade as "A" | "B" | "C" | null,
    });
  }

  const { data: teamResults, error: teamErr } = await admin
    .from("team_results")
    .select(
      "feast_competition_id, grade, position, team_registration:team_registrations(shakha:shakhas(name), team_registration_members(participant:participants(name)))"
    )
    .in("feast_competition_id", fcIds)
    .not("published_at", "is", null);
  if (teamErr) return { error: teamErr.message };

  for (const r of teamResults ?? []) {
    const teamReg = Array.isArray(r.team_registration) ? r.team_registration[0] : r.team_registration;
    const shakha = Array.isArray(teamReg?.shakha) ? teamReg?.shakha[0] : teamReg?.shakha;
    const members = teamReg?.team_registration_members ?? [];
    const competitionName = compNameByFc.get(r.feast_competition_id) ?? "Competition";
    for (const m of members) {
      const participant = Array.isArray(m.participant) ? m.participant[0] : m.participant;
      if (!participant) continue;
      rows.push({
        name: participant.name,
        shakhaName: shakha?.name ?? "—",
        competitionName,
        place: r.position,
        grade: r.grade as "A" | "B" | "C" | null,
      });
    }
  }

  return { data: rows };
}
