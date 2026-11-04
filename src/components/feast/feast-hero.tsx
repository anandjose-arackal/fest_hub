"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { OrgSettings } from "@/types";

const EASE = [0.2, 0.8, 0.2, 1] as const;

export function FeastHero({ org }: { org: OrgSettings }) {
  const still = useReducedMotion();
  const appName = org.app_name || "Competitions & Results";
  const orgName = org.org_name_en || "Fest Hub";
  const enter = (delay: number, from: Record<string, number | string> = {}) =>
    still
      ? {}
      : { initial: { opacity: 0, y: 14, ...from }, animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }, transition: { duration: 0.9, delay, ease: EASE } };

  return (
    <section className="px-1 pt-[72px]">
      {/* The illustration's empty centre holds the title; its art (dancers,
          drummer, singer, painter, lamp) frames it on both sides. Phones get
          artwork with Jesus and the children below the title; from lg up the
          banner is a short 6:1 strip with the title centred. */}
      <div className="fp-hero-stage relative isolate flex aspect-[1.55/1] items-start justify-center overflow-hidden rounded-[24px] text-center sm:aspect-[2.5/1] sm:items-center sm:rounded-[32px] lg:aspect-[6/1] lg:min-h-[150px] lg:items-center">
        <picture>
          <source media="(min-width: 1024px)" srcSet="/hero/hero-lap.webp" />
          <source media="(min-width: 640px)" srcSet="/hero/hero-wide.webp" />
          <motion.img
          src="/hero/hero-phone.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full select-none object-cover object-center sm:object-top lg:object-[50%_42%]"
          {...(still ? {} : { initial: { scale: 1.08, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 1.4, ease: EASE } })}
          />
        </picture>
        <span aria-hidden="true" className="fp-hero-scrim pointer-events-none absolute inset-0 -z-10" />

        <div className="relative max-w-[94%] px-1 pt-2.5 sm:max-w-[64%] sm:py-3 lg:max-w-[64%] lg:py-0">
          <h1 className="m-0" aria-label={`${orgName} — ${appName}`}>
            <motion.span {...enter(0.3)} aria-hidden="true" className="fp-ml block text-[15.5px] font-extrabold leading-[1.15] text-white sm:text-[22px] lg:text-[clamp(18px,1.75vw,30px)]" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>
              {orgName}
            </motion.span>
            <motion.span
              aria-hidden="true"
              {...(still ? {} : { initial: { opacity: 0, scale: 0.9, filter: "blur(14px)" }, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, transition: { duration: 1, delay: 0.5, ease: EASE } })}
              className="fp-hero-title mt-1 block whitespace-nowrap text-[min(13vw,50px)] sm:text-[clamp(56px,8.5vw,96px)] lg:text-[clamp(52px,5.2vw,92px)]"
            >
              {appName}
            </motion.span>
          </h1>

          {org.area_name_en && (
            <motion.div {...enter(0.95)} className="mt-1 flex items-center justify-center gap-2.5 sm:mt-2.5 sm:gap-4 lg:mt-1.5">
              <span aria-hidden="true" className="fp-hero-rule h-px w-8 sm:w-16 lg:w-24" />
              <span className="min-w-0">
                <span className="fp-hero-loc-name block whitespace-nowrap text-[13px] sm:text-[16px] lg:text-[clamp(15px,1.3vw,22px)]">{org.area_name_en}</span>
                {org.area_name_local && (
                  <span className="fp-ml mt-0.5 block text-[11px] font-bold text-white/80 sm:text-[12.5px]">{org.area_name_local}</span>
                )}
              </span>
              <span aria-hidden="true" className="fp-hero-rule h-px w-8 rotate-180 sm:w-16 lg:w-24" />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
