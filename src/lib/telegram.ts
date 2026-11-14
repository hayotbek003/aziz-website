/* Тонкая обёртка над Telegram Web Apps API (telegram-web-app.js подключён в layout). */
type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; username?: string; first_name?: string } };
  platform?: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  openInvoice?: (url: string, cb?: (status: string) => void) => void;
  showConfirm?: (msg: string, cb: (ok: boolean) => void) => void;
  HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (s: string) => void };
  isVersionAtLeast?: (v: string) => boolean;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window.Telegram?.WebApp;
  return w && w.initData ? w : null;
}

export function tgReady(color = "#07070A") {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.setHeaderColor?.(color);
    w.setBackgroundColor?.(color);
  } catch {
    /* старые клиенты */
  }
}

/** Открыть ссылку t.me — внутри Telegram без выхода из Web App. */
export function openTelegram(url: string) {
  const w = tg();
  if (w && url.startsWith("https://t.me/")) w.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

export function openExternal(url: string) {
  const w = tg();
  if (w) w.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export function haptic(kind: "light" | "success" | "error" = "light") {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "light") h.impactOccurred("light");
    else h.notificationOccurred(kind);
  } catch {
    /* ignore */
  }
}
