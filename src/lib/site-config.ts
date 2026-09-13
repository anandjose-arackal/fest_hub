// Product-level (not org-level) site defaults. Org branding (name, tagline,
// logo) is admin-configurable via the `org_settings` table — see
// `src/lib/org-settings.ts` — and should be preferred over these fallbacks
// wherever an org has configured itself. These constants exist so the app
// has something sane to render before any org has been set up.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const SITE_NAME = "Fest Hub";
export const SITE_SHORT_NAME = "Fest Hub";
export const SITE_DESCRIPTION =
  "Fest competition management — registrations, results, standings, and live displays for community fest competitions.";
export const SITE_KEYWORDS = [
  "fest competitions",
  "literature fest",
  "arts fest",
  "competition management",
  "registrations",
  "results",
];
export const SITE_LOCALE = "en_IN";
export const SITE_LANG = "en";

export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const LOGO_URL = `${SITE_URL}/logo.png`;

export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: LOGO_URL,
  description: SITE_DESCRIPTION,
  sameAs: [],
};

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};
