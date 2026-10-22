// Angel's mark: a small haloed figure with wings — drawn, not an emoji, so it
// takes the theme's colours. The halo is gold in every theme (gold means the
// winners here); wings and robe follow --fp-ink.
export function AngelMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <ellipse cx="24" cy="8.5" rx="8.5" ry="3" fill="none" stroke="#FFD66B" strokeWidth="2.4" />
      <path d="M22 21c-6-6.5-14-7.5-18-4 1 7 6.5 12.5 14.5 12.5" fill="currentColor" opacity=".55" />
      <path d="M26 21c6-6.5 14-7.5 18-4-1 7-6.5 12.5-14.5 12.5" fill="currentColor" opacity=".55" />
      <circle cx="24" cy="17" r="5.2" fill="currentColor" />
      <path d="M24 23.5c-5.2 0-8.6 6.4-10 19.5h20c-1.4-13.1-4.8-19.5-10-19.5z" fill="currentColor" />
    </svg>
  );
}
