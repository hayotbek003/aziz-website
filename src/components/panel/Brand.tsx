import { cx } from "@/lib/format";

export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="azg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD36B" />
          <stop offset=".5" stopColor="#F5A524" />
          <stop offset="1" stopColor="#E08A00" />
        </linearGradient>
      </defs>
      <path d="M32 6 57 58H45L32 29 19 58H7L32 6Z" fill="url(#azg)" />
      <path d="M21.5 48h21l-3.7-8h-13.6Z" fill="#050506" />
    </svg>
  );
}

export function BrandLogo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <BrandMark size={compact ? 26 : 32} />
      <span className="font-brand text-[15px] font-black leading-none tracking-tight">
        <span className="gold-text">AZIZ</span> <span className="text-white">WEBSITE</span>
      </span>
    </span>
  );
}
