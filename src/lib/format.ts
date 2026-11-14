export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

export function formatNumber(n: number) {
  return Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatPrice(n: number, currency = "сум") {
  return `${formatNumber(n)} ${currency}`.trim();
}

/** Ссылка на изображение: id из медиа-хранилища или внешний URL. */
export function mediaUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (/^(https?:|data:|blob:|\/)/.test(ref)) return ref;
  return `/api/media/${ref}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
