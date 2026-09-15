import type { Metadata, Viewport } from "next";
import { Baloo_Chettan_2, Anek_Malayalam, Gayathri } from "next/font/google";
import { Providers } from "@/components/providers";
import {
  SITE_URL, SITE_NAME, SITE_SHORT_NAME, SITE_DESCRIPTION,
  SITE_KEYWORDS, SITE_LOCALE, OG_IMAGE,
  ORGANIZATION_SCHEMA, WEBSITE_SCHEMA,
} from "@/lib/site-config";
import { getOrgSettings } from "@/lib/org-settings";
import type { PortalTheme } from "@/types";
import "./globals.css";

// Browser-chrome tint (mobile address bar / task switcher) per portal theme —
// keep in sync with globals.css's [data-fp-theme] --fp-primary values. This
// can't reference the CSS variable directly since it renders as a <meta>
// tag's static content, not DOM-scoped styling.
const THEME_COLORS: Record<PortalTheme, string> = {
  violet: "#6B46FF",
  ocean: "#0D9488",
  sunset: "#E11D48",
};

// --font-poppins is used throughout the Feast Portal/admin UI for body text;
// --font-anek is relied on by /screen and several feast components for
// Malayalam-capable display text. Both must be declared on the root layout —
// /screen's own layout only adds Oswald/Rajdhani/Barlow on top of this.
const balooChettan2 = Baloo_Chettan_2({
  subsets: ["latin", "malayalam"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const anekMalayalam = Anek_Malayalam({
  subsets: ["malayalam", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-anek",
  display: "swap",
});

const gayathri = Gayathri({
  subsets: ["latin", "malayalam"],
  weight: ["400", "700"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateViewport(): Promise<Viewport> {
  const { theme } = await getOrgSettings();
  const color = THEME_COLORS[theme] ?? THEME_COLORS.violet;
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color },
      { media: "(prefers-color-scheme: dark)", color },
    ],
  };
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  applicationName: SITE_SHORT_NAME,
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme } = await getOrgSettings();
  return (
    <html
      lang="en"
      className={`${balooChettan2.variable} ${anekMalayalam.variable} ${gayathri.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_SCHEMA) }}
        />
      </head>
      <body
        data-fp-theme={theme}
        className="min-h-full flex flex-col bg-[#FAFAFC]"
        style={{ fontFamily: "var(--font-inter), sans-serif" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
