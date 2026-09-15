// Hand-written interfaces matching supabase/migrations/*.sql. Query results
// are cast into these (`as Participant`, etc.) rather than inferred through
// a generated Database type — matches the source app's pattern. Keep these
// in sync with the SQL by hand; the SQL is ground truth.

export type UserRole = "admin" | "me_admin" | "sa_admin";

// Optional org hierarchy (see supabase/migrations/014_org_hierarchy.sql):
// Diocese -> Meghala -> Shakha, Shakha is the default/leaf level. Which
// tiers are in play for an org is org_settings.hierarchy_level, not a
// per-row flag — dioceses/meghalas simply sit unused for a 'shakha'-level
// org rather than being conditionally absent from the schema.
export type HierarchyLevel = "shakha" | "meghala" | "diocese";

export interface Diocese {
  id: string;
  name: string;
  slug: string;
  color: string;
  created_at: string;
}

export interface Meghala {
  id: string;
  name: string;
  slug: string;
  diocese_id: string | null;
  color: string;
  created_at: string;
  diocese?: Diocese | null;
}

export interface Shakha {
  id: string;
  name: string;
  slug: string;
  color: string;
  meghala_id: string | null;
  created_at: string;
  meghala?: Meghala | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  shakha_id: string | null;
  meghala_id: string | null;
  diocese_id: string | null;
  created_at: string;
  updated_at: string;
  shakha?: Shakha | null;
  meghala?: Meghala | null;
  diocese?: Diocese | null;
}

export type FeastStatus = "draft" | "registration_open" | "ongoing" | "completed";
export type FeastType = "literature" | "arts" | "sports" | "general" | string;

export interface Feast {
  id: string;
  name: string;
  slug: string;
  type: FeastType;
  year: string;
  status: FeastStatus | string;
  description: string | null;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_edit_deadline: string | null;
  registration_deadline: string | null;
  is_external: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  feast_id: string;
  number: number;
  title: string;
  venue: string | null;
  created_at: string;
}

export interface CompetitionCategory {
  id: string;
  slug: string;
  name: string;
  min_dob: string | null;
  max_dob: string | null;
  sort_order: number;
  created_at: string;
}

export type CompetitionGender = "boy" | "girl" | "common" | null;

export interface Competition {
  id: string;
  name: string;
  type: "individual" | "group" | string;
  category: string | null;
  description: string | null;
  gender: CompetitionGender;
  competition_category_id: string | null;
  icon: string | null;
  max_per_shakha: number;
  max_team_size: number | null;
  created_at: string;
}

export type CompStatus = "upcoming" | "progressing" | "completed" | "published";
export type ResultStatus = "draft" | "published";

export interface FeastCompetition {
  id: string;
  feast_id: string;
  competition_id: string;
  display_order: number;
  time_slot: string | null;
  venue: string | null;
  max_slots: number | null;
  stage_id: string | null;
  scheduled_time: string | null;
  comp_status: CompStatus;
  progress_pct: number | null;
  info: string | null;
  max_score: number | null;
  result_status: ResultStatus;
  created_at: string;
  competition?: Competition;
  stage?: Stage | null;
}

export interface Participant {
  id: string;
  feast_id: string;
  shakha_id: string | null;
  name: string;
  house_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  category: string | null;
  competition_category_id: string | null;
  phone: string | null;
  registration_number: string | null;
  created_at: string;
  updated_at: string;
  shakha?: Shakha | null;
}

export interface ParticipantRegistration {
  id: string;
  participant_id: string;
  feast_competition_id: string;
  participated: boolean;
  chance_no: number | null;
  created_at: string;
  participant?: Participant;
  feast_competition?: FeastCompetition;
}

export interface TeamRegistration {
  id: string;
  feast_id: string;
  feast_competition_id: string;
  shakha_id: string;
  team_name: string;
  participated: boolean;
  chance_no: number | null;
  created_at: string;
  updated_at: string;
  shakha?: Shakha;
}

export interface TeamRegistrationMember {
  id: string;
  team_registration_id: string;
  participant_id: string;
  feast_competition_id: string;
  created_at: string;
  participant?: Participant;
}

export type Grade = "A" | "B" | "C" | null;

export interface CompetitionResult {
  id: string;
  feast_competition_id: string;
  participant_registration_id: string;
  score: number;
  grade: Grade;
  grade_points: number;
  position: number | null;
  position_points: number;
  total_points: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamResult {
  id: string;
  feast_competition_id: string;
  team_registration_id: string;
  score: number;
  grade: Grade;
  grade_points: number;
  position: number | null;
  position_points: number;
  total_points: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShakhaFeastStanding {
  id: string;
  feast_id: string;
  shakha_id: string;
  sub_junior_points: number;
  junior_points: number;
  senior_points: number;
  super_senior_points: number;
  elder_points: number;
  team_points: number;
  grand_total: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  a_grade_count: number;
  b_grade_count: number;
  c_grade_count: number;
  rank: number | null;
  updated_at: string;
  shakha?: Shakha;
}

export type PortalTheme = "violet" | "ocean" | "sunset";

export interface OrgSettings {
  id: true;
  org_name_en: string;
  org_name_local: string;
  area_name_en: string;
  area_name_local: string;
  tagline: string;
  logo_url: string;
  hierarchy_level: HierarchyLevel;
  theme: PortalTheme;
  created_at: string;
  updated_at: string;
}

export type CertificateFieldType = "name" | "house_name" | "name_house" | "place" | "shakha" | "grade_text" | "grade_tick" | "competition" | "image";

export interface CertificateField {
  id: string;
  type: CertificateFieldType;
  /** Center anchor, both text and image fields. */
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
  font_size_pt: number;
  color: string;
  text_align: "left" | "center" | "right";
  /** CSS font-family value actually applied, e.g. "'Dancing Script', cursive". */
  font_family: string;
  /** Google Fonts API family segment to load, e.g. "Dancing+Script:wght@700" — null for system fonts that need no fetch. */
  google_font: string | null;
  /** Only meaningful when type === "grade_tick" — which grade this marker represents. */
  gradeValue?: "A" | "B" | "C";
  /** Only meaningful when type === "image" (e.g. an imported signature). */
  image_url?: string;
  width_mm?: number;
  height_mm?: number;
}

export interface CertificateTemplate {
  feast_id: string;
  paper_width_mm: number;
  paper_height_mm: number;
  background_image_url: string;
  fields: CertificateField[];
  created_at?: string;
  updated_at?: string;
}

export interface CertificateRosterRow {
  name: string;
  /** Empty string when the participant has no house name set — the field simply doesn't render on that certificate. */
  houseName: string;
  shakhaName: string;
  competitionName: string;
  /** competitionName prefixed with age category + gender, e.g. "Sub Junior Boys Elocution" — gender omitted when "common". */
  competitionLabel: string;
  place: number | null;
  grade: "A" | "B" | "C" | null;
}
