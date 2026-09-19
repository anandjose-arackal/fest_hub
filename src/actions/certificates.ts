"use server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { CertificateField, CertificateRosterRow, CertificateTemplate } from "@/types";

// certificate_templates has no RLS (no public consumer — only this file's
// actions and the admin designer page touch it), so every read/write here
// goes through the service-role client, same convention as
// shakha_feast_standings / competition_results.

const MAX_ASSET_BYTES = 4 * 1024 * 1024; // 4MB — leaves headroom under next.config.ts's 5mb server-action body limit

// Uploads a background/signature image to the public "certificate-assets"
// bucket (migration 012). Goes through the service-role client — same
// reason as everything else in this file — so the bucket itself needs no
// storage RLS policies, just public:true for the printed <img> URLs.
export async function uploadCertificateAsset(
  feastId: string,
  fileName: string,
  fileBase64: string,
  contentType: string
): Promise<{ url?: string; error?: string }> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(fileBase64, "base64");
  } catch {
    return { error: "Invalid file data." };
  }
  if (buffer.length === 0) return { error: "File is empty." };
  if (buffer.length > MAX_ASSET_BYTES) return { error: "Image is too large — please use a file under 4MB." };
  if (!contentType.startsWith("image/")) return { error: "Only image files are supported." };

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${feastId}/${Date.now()}-${safeName}`;
  const admin = getSupabaseAdmin();
  const { error } = await admin.storage.from("certificate-assets").upload(path, buffer, { contentType, upsert: false });
  if (error) return { error: error.message };
  const { data } = admin.storage.from("certificate-assets").getPublicUrl(path);
  return { url: data.publicUrl };
}

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

interface CompInfo {
  name: string;
  /** name prefixed with age category + gender, e.g. "Sub Junior Boys Elocution" — gender omitted when "common"/null. */
  label: string;
  /** competitions.name_en, falling back to name when unset. */
  nameEn: string;
  /** nameEn prefixed with age category + gender, same convention as label. */
  labelEn: string;
}

function buildCompetitionLabel(name: string, gender: string | null, categoryName: string | null): string {
  const genderWord = gender === "boy" ? "Boys" : gender === "girl" ? "Girls" : null; // "common" and null both stay unlabeled
  return [categoryName, genderWord, name].filter(Boolean).join(" ");
}

// Shared by both roster queries below — given a set of published
// feast_competition ids (and their names), returns one CertificateRosterRow
// per published individual result plus one row per member of every
// published team result (so each teammate gets their own certificate while
// sharing the team's place/grade/shakha).
async function buildRosterRows(
  admin: ReturnType<typeof getSupabaseAdmin>,
  fcIds: string[],
  compInfoByFc: Map<string, CompInfo>
): Promise<{ data?: CertificateRosterRow[]; error?: string }> {
  const rows: CertificateRosterRow[] = [];

  const { data: indivResults, error: indivErr } = await admin
    .from("competition_results")
    .select(
      "feast_competition_id, grade, position, participant_registration:participant_registrations(participant:participants(name, house_name, shakha:shakhas(name)))"
    )
    .in("feast_competition_id", fcIds)
    .not("published_at", "is", null);
  if (indivErr) return { error: indivErr.message };

  for (const r of indivResults ?? []) {
    const partReg = Array.isArray(r.participant_registration) ? r.participant_registration[0] : r.participant_registration;
    const participant = Array.isArray(partReg?.participant) ? partReg?.participant[0] : partReg?.participant;
    const shakha = Array.isArray(participant?.shakha) ? participant?.shakha[0] : participant?.shakha;
    if (!participant) continue;
    const compInfo = compInfoByFc.get(r.feast_competition_id);
    rows.push({
      name: participant.name,
      houseName: participant.house_name ?? "",
      shakhaName: shakha?.name ?? "—",
      competitionName: compInfo?.name ?? "Competition",
      competitionLabel: compInfo?.label ?? "Competition",
      competitionNameEn: compInfo?.nameEn ?? "Competition",
      competitionLabelEn: compInfo?.labelEn ?? "Competition",
      place: r.position,
      grade: r.grade as "A" | "B" | "C" | null,
    });
  }

  const { data: teamResults, error: teamErr } = await admin
    .from("team_results")
    .select(
      "feast_competition_id, grade, position, team_registration:team_registrations(shakha:shakhas(name), team_registration_members(participant:participants(name, house_name)))"
    )
    .in("feast_competition_id", fcIds)
    .not("published_at", "is", null);
  if (teamErr) return { error: teamErr.message };

  for (const r of teamResults ?? []) {
    const teamReg = Array.isArray(r.team_registration) ? r.team_registration[0] : r.team_registration;
    const shakha = Array.isArray(teamReg?.shakha) ? teamReg?.shakha[0] : teamReg?.shakha;
    const members = teamReg?.team_registration_members ?? [];
    const compInfo = compInfoByFc.get(r.feast_competition_id);
    for (const m of members) {
      const participant = Array.isArray(m.participant) ? m.participant[0] : m.participant;
      if (!participant) continue;
      rows.push({
        name: participant.name,
        houseName: participant.house_name ?? "",
        shakhaName: shakha?.name ?? "—",
        competitionName: compInfo?.name ?? "Competition",
        competitionLabel: compInfo?.label ?? "Competition",
        competitionNameEn: compInfo?.nameEn ?? "Competition",
        competitionLabelEn: compInfo?.labelEn ?? "Competition",
        place: r.position,
        grade: r.grade as "A" | "B" | "C" | null,
      });
    }
  }

  return { data: rows };
}

// Every participant with a published result across the whole feast.
export async function getCertificateRoster(feastId: string): Promise<{ data?: CertificateRosterRow[]; error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: fcs, error: fcErr } = await admin
    .from("feast_competitions")
    .select("id, competition:competitions(name, name_en, gender, competition_category:competition_categories(name))")
    .eq("feast_id", feastId)
    .eq("result_status", "published");
  if (fcErr) return { error: fcErr.message };
  if (!fcs || fcs.length === 0) return { data: [] };

  const compInfoByFc = new Map<string, CompInfo>();
  for (const fc of fcs) {
    const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
    const category = Array.isArray(competition?.competition_category) ? competition?.competition_category[0] : competition?.competition_category;
    const name = competition?.name ?? "Competition";
    const nameEn = competition?.name_en || name;
    const gender = competition?.gender ?? null;
    const categoryName = category?.name ?? null;
    compInfoByFc.set(fc.id, {
      name,
      label: buildCompetitionLabel(name, gender, categoryName),
      nameEn,
      labelEn: buildCompetitionLabel(nameEn, gender, categoryName),
    });
  }

  return buildRosterRows(admin, fcs.map((f) => f.id), compInfoByFc);
}

// Every participant with a published result for ONE competition — used by
// the "Print Certificate" button on /admin/results, scoped to whichever
// competition is currently selected there.
export async function getCertificateRosterForCompetition(feastCompetitionId: string): Promise<{ data?: CertificateRosterRow[]; error?: string }> {
  const admin = getSupabaseAdmin();

  const { data: fc, error: fcErr } = await admin
    .from("feast_competitions")
    .select("id, competition:competitions(name, name_en, gender, competition_category:competition_categories(name))")
    .eq("id", feastCompetitionId)
    .single();
  if (fcErr || !fc) return { error: fcErr?.message ?? "Competition not found" };

  const competition = Array.isArray(fc.competition) ? fc.competition[0] : fc.competition;
  const category = Array.isArray(competition?.competition_category) ? competition?.competition_category[0] : competition?.competition_category;
  const name = competition?.name ?? "Competition";
  const nameEn = competition?.name_en || name;
  const gender = competition?.gender ?? null;
  const categoryName = category?.name ?? null;
  const compInfoByFc = new Map([
    [fc.id, { name, label: buildCompetitionLabel(name, gender, categoryName), nameEn, labelEn: buildCompetitionLabel(nameEn, gender, categoryName) }],
  ]);

  return buildRosterRows(admin, [fc.id], compInfoByFc);
}
