import { useEffect, useState } from "react";
import { sectionKey, type DashboardSection } from "./dashboard-types";

const ROTATE_MS = 15_000; // dwell time on a rankings/point-table screen
export const SUB_MS = 8_000; // dwell time on each sub-position within a competition screen
const SUB_COUNT = 3; // 1st/2nd/3rd or Grade A/B/C

/**
 * Drives the big-screen's slide rotation across a two-level index:
 *   sectionIdx — which DashboardSection (Overall, Feast A, Feast B, ...)
 *   screenIdx  — 0..rankingScreens-1 = rankings (Meghala then Shakha when the
 *                org has a meghala tier, otherwise just Shakha); in a feast
 *                section, rankingScreens..rankingScreens+N-1 = competition N
 *   subIdx     — sub-position cycle (1st/2nd/3rd or Grade A/B/C)
 */
export function useDashboardRotation(
  sections: DashboardSection[],
  activeCompetitionCount: number,
  paused = false,
  enabledSectionKeys: Set<string> | null = null,
  rankingScreens = 1
) {
  const [sectionIdx, setSectionIdxRaw] = useState(0);
  const [screenIdx, setScreenIdxRaw] = useState(0);
  const [subIdx, setSubIdx] = useState(0);

  const sectionsKey = sections.map(sectionKey).join(",");

  const safeSectionIdx = sections.length ? Math.min(sectionIdx, sections.length - 1) : 0;
  const activeSection: DashboardSection = sections[safeSectionIdx] ?? { kind: "overall" };
  const competitionCount = activeSection.kind === "feast" ? activeCompetitionCount : 0;
  const lastScreenIdx = rankingScreens - 1 + competitionCount;
  const safeScreenIdx = Math.min(screenIdx, lastScreenIdx);
  const isRankingsScreen = safeScreenIdx < rankingScreens;

  const goToSection = (i: number) => {
    setSectionIdxRaw(i);
    setScreenIdxRaw(0);
    setSubIdx(0);
  };
  const goToScreen = (i: number) => {
    setScreenIdxRaw(i);
    setSubIdx(0);
  };

  const nextRotationSectionIdx = (from: number): number => {
    if (!enabledSectionKeys) return (from + 1) % sections.length;
    // Everything unchecked: hold on the first section (Overall).
    if (enabledSectionKeys.size === 0) return 0;
    for (let step = 1; step <= sections.length; step++) {
      const i = (from + step) % sections.length;
      if (enabledSectionKeys.has(sectionKey(sections[i]))) return i;
    }
    return (from + 1) % sections.length;
  };

  useEffect(() => {
    if (sections.length === 0 || paused) return;
    const delay = isRankingsScreen ? ROTATE_MS : SUB_MS;
    const id = setTimeout(() => {
      if (isRankingsScreen) {
        if (safeScreenIdx < lastScreenIdx) {
          // Next ranking tier, or the first competition after the last tier.
          setScreenIdxRaw(safeScreenIdx + 1);
          setSubIdx(0);
        } else {
          goToSection(nextRotationSectionIdx(safeSectionIdx));
        }
      } else {
        const nextSub = subIdx + 1;
        if (nextSub < SUB_COUNT) {
          setSubIdx(nextSub);
        } else if (safeScreenIdx < lastScreenIdx) {
          setScreenIdxRaw(safeScreenIdx + 1);
          setSubIdx(0);
        } else {
          goToSection(nextRotationSectionIdx(safeSectionIdx));
        }
      }
    }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, safeSectionIdx, safeScreenIdx, subIdx, isRankingsScreen, lastScreenIdx, paused, enabledSectionKeys]);

  return { sectionIdx: safeSectionIdx, screenIdx: safeScreenIdx, subIdx, activeSection, isRankingsScreen, goToSection, goToScreen };
}
