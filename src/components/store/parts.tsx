"use client";
import {
  ChevronRight, Facebook, Globe, Heart, Home, Info, Instagram, LayoutGrid, Menu, MessageCircle, Phone, Search, Send,
  X, Youtube,
} from "lucide-react";
import { useState } from "react";
import { cx, formatPrice, mediaUrl } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { openExternal, openTelegram } from "@/lib/telegram";
import type { Product } from "@/lib/types";
import { SLink, useStore } from "./context";

/* ---------- Логотип ---------- */
export function StoreLogo({ size = 34 }: { size?: number }) {
  const { data } = useStore();
  const { logo, name } = data.config;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaUrl(logo)} alt={name} style={{ height: size, width: "auto", maxWidth: size * 3.2 }} className="object-contain" />;
  }
  return (
    <span
      className="s-btn grid shrink-0 place-items-center font-head font-black"
      style={{ width: size, height: size, borderRadius: Math.max(8, size * 0.3), fontSize: size * 0.5 }}
    >
      {(name || "A").trim().charAt(0).toUpperCase()}
    </span>
  );
}

/* ---------- Арт-заглушка товара (если нет фото) ---------- */
export function ProductArt({ icon, className, big }: { icon: string; className?: string; big?: boolean }) {
  return (
    <div className={cx("s-art s-grid-bg relative grid place-items-center overflow-hidden", className)}>
      <div className="absolute inset-x-6 bottom-3 h-6 rounded-full bg-black/40 blur-xl" />
      <Icon name={icon} className={cx("s-glow relative text-sp2", big ? "h-28 w-28" : "h-14 w-14")} strokeWidth={1.4} />
    </div>
  );
}

export function ProductImage({ p, className, big }: { p: Product; className?: string; big?: boolean }) {
  if (p.images?.[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={mediaUrl(p.images[0])} alt={p.name} loading="lazy" className={cx("h-full w-full object-cover", className)} />;
  }
  return <ProductArt icon={p.icon} className={cx("h-full w-full", className)} big={big} />;
}

/* ---------- Цена ---------- */
export function Price({ p, big }: { p: Product; big?: boolean }) {
  const { data, t } = useStore();
  const cur = data.config.currency;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className={cx("font-bold text-sp", big ? "text-2xl @3xl:text-3xl" : "text-[13px] @md:text-sm")}>
        {p.priceFrom && <span className="font-medium">{t.from} </span>}
        {formatPrice(p.price, cur)}
      </span>
      {p.oldPrice && p.oldPrice > p.price ? (
        <span className={cx("text-smu line-through", big ? "text-base" : "text-[11px]")}>{formatPrice(p.oldPrice, cur)}</span>
      ) : null}
    </div>
  );
}

/* ---------- Карточка товара ---------- */
export function ProductCard({ p }: { p: Product }) {
  const { fav, toggleFav, t } = useStore();
  const isFav = fav.includes(p.id);
  const discount = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return (
    <div className="s-card s-card-hover group relative flex flex-col overflow-hidden">
      <SLink to={`/product/${p.id}`} className="block">
        <div className="relative aspect-square overflow-hidden">
          <ProductImage p={p} className="transition duration-500 group-hover:scale-105" />
          {!p.inStock && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-semibold text-white">{t.outOfStock}</div>
          )}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {discount > 0 && <span className="s-btn px-2 py-0.5 text-[10px] font-bold">−{discount}%</span>}
            {p.isPopular && <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">★ Top</span>}
          </div>
        </div>
      </SLink>
      <button
        type="button"
        aria-label={t.addFav}
        onClick={() => toggleFav(p.id)}
        className={cx(
          "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition",
          isFav ? "bg-sp text-white" : "bg-black/45 text-white/90 hover:bg-black/70",
        )}
      >
        <Heart className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
      </button>
      <SLink to={`/product/${p.id}`} className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-[13px] font-semibold leading-snug @md:text-sm">{p.name}</div>
        <div className="mt-auto pt-1">
          <Price p={p} />
        </div>
      </SLink>
    </div>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  const { t } = useStore();
  if (!items.length) return <div className="s-card p-8 text-center text-smu">{t.empty}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 @3xl:gap-4">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export function SectionTitle({ title, to, action }: { title: string; to?: string; action?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 @3xl:mb-4">
      <h2 className="text-lg font-bold @3xl:text-2xl">{title}</h2>
      {to && (
        <SLink to={to} className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-sp hover:underline">
          {action} <ChevronRight className="h-4 w-4" />
        </SLink>
      )}
    </div>
  );
}

/* ---------- Кнопка «Заказать в Telegram» ---------- */
export function orderLink(seller: string, message: string) {
  const user = seller.replace(/^@/, "").replace(/^(https?:\/\/)?t\.me\//, "");
  return `https://t.me/${user}?text=${encodeURIComponent(message)}`;
}

export function OrderButton({ p, className }: { p: Product; className?: string }) {
  const { data, t, track, productUrl, embedded } = useStore();
  const cfg = data.config;
  const [err, setErr] = useState("");
  const onClick = () => {
    const seller = cfg.contacts.telegram;
    if (!seller) {
      setErr(t.noSeller);
      return;
    }
    const price = `${p.priceFrom ? t.from + " " : ""}${formatPrice(p.price, cfg.currency)}`;
    const msg = (cfg.order.message || "{product}\n{price}\n{link}")
      .replaceAll("{product}", p.name)
      .replaceAll("{price}", price)
      .replaceAll("{link}", productUrl(p))
      .replaceAll("{shop}", cfg.name);
    track("order_click", p.id);
    if (embedded) {
      setErr("Предпросмотр: в опубликованном магазине откроется Telegram продавца");
      return;
    }
    openTelegram(orderLink(seller, msg));
  };
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={!p.inStock}
        className="s-btn flex w-full items-center justify-center gap-2 px-6 py-3.5 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-5 w-5" />
        {p.inStock ? cfg.order.button || "Заказать в Telegram" : t.outOfStock}
      </button>
      <p className={cx("mt-2 text-center text-xs", err ? "text-sp" : "text-smu")}>{err || t.orderNote}</p>
    </div>
  );
}

/* ---------- Шапка, меню, нижняя навигация, подвал ---------- */
const NAV = [
  { to: "/", key: "home" as const },
  { to: "/catalog", key: "catalog" as const },
  { to: "/delivery", key: "delivery" as const },
  { to: "/about", key: "about" as const },
  { to: "/contacts", key: "contacts" as const },
];

export function Header() {
  const { data, t, path, fav, setSearchFocus, lang, setLang } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-sink/[0.06] bg-sbg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 @3xl:h-16">
          <button type="button" aria-label={t.menu} onClick={() => setOpen(true)} className="-ml-1 grid h-9 w-9 place-items-center rounded-full hover:bg-sink/5 @3xl:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <SLink to="/" className="flex min-w-0 items-center gap-2.5">
            <StoreLogo size={32} />
            <span className="truncate font-head text-[17px] font-bold text-sp2 @3xl:text-lg">{data.config.name}</span>
          </SLink>
          <nav className="ml-6 hidden items-center gap-1 @3xl:flex">
            {NAV.map((n) => (
              <SLink
                key={n.to}
                to={n.to}
                className={cx(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  (n.to === "/" ? path === "/" : path.startsWith(n.to)) ? "bg-sp/15 text-sp" : "text-smu hover:text-sink",
                )}
              >
                {t[n.key]}
              </SLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLang(lang === "ru" ? "uz" : "ru")}
              className="hidden h-9 rounded-full px-2.5 text-xs font-bold uppercase text-smu hover:bg-sink/5 hover:text-sink @md:block"
            >
              {lang === "ru" ? "UZ" : "RU"}
            </button>
            <SLink to="/catalog" onClick={() => setSearchFocus(true)} ariaLabel="search" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sink/5">
              <Search className="h-5 w-5" />
            </SLink>
            <SLink to="/favorites" ariaLabel={t.favorites} className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-sink/5">
              <Heart className="h-5 w-5" />
              {fav.length > 0 && (
                <span className="s-btn absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center px-1 text-[10px] font-bold">{fav.length}</span>
              )}
            </SLink>
          </div>
        </div>
      </header>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { data, t, lang, setLang } = useStore();
  const links = [
    ...NAV,
    { to: "/faq", key: "faq" as const },
    { to: "/favorites", key: "favorites" as const },
  ];
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs animate-fadein flex-col gap-1 overflow-y-auto border-r border-sink/10 bg-sbg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StoreLogo size={30} />
            <span className="font-head font-bold">{data.config.name}</span>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-sink/5" aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {links.map((n) => (
          <SLink key={n.to} to={n.to} onClick={onClose} className="flex items-center justify-between rounded-xl px-3 py-3 text-[15px] font-medium hover:bg-sink/5">
            {t[n.key]} <ChevronRight className="h-4 w-4 text-smu" />
          </SLink>
        ))}
        {data.categories.length > 0 && (
          <>
            <div className="mt-3 px-3 text-xs font-semibold uppercase tracking-wider text-smu">{t.categories}</div>
            {data.categories.map((c) => (
              <SLink key={c.id} to={`/catalog/${c.slug}`} onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-sink/5">
                <Icon name={c.icon} className="h-4 w-4 text-sp" /> {c.name}
              </SLink>
            ))}
          </>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          {(["ru", "uz"] as const).map((l) => (
            <button
              key={l}
              type="button"
              data-active={lang === l}
              onClick={() => setLang(l)}
              className="s-chip flex-1 py-2 text-sm font-semibold uppercase"
            >
              {l === "ru" ? "Русский" : "O'zbekcha"}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function BottomNav() {
  const { t, path, fav } = useStore();
  const items = [
    { to: "/", icon: Home, label: t.home, active: path === "/" },
    { to: "/catalog", icon: LayoutGrid, label: t.catalog, active: path.startsWith("/catalog") || path.startsWith("/product") },
    { to: "/favorites", icon: Heart, label: t.favorites, active: path.startsWith("/favorites"), badge: fav.length },
    { to: "/about", icon: Info, label: t.about, active: path.startsWith("/about") || path.startsWith("/faq") || path.startsWith("/delivery") },
    { to: "/contacts", icon: MessageCircle, label: t.contacts, active: path.startsWith("/contacts") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sink/[0.07] bg-sbg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl @3xl:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => (
          <SLink key={it.to} to={it.to} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", it.active ? "text-sp" : "text-smu")}>
            <it.icon className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{it.label}</span>
            {!!it.badge && <span className="s-btn absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center px-1 text-[9px] font-bold">{it.badge}</span>}
          </SLink>
        ))}
      </div>
    </nav>
  );
}

export function socialLinks(s: Record<string, string>) {
  const norm = (v: string, prefix: string) => (/^https?:\/\//.test(v) ? v : prefix + v.replace(/^@/, ""));
  const out: { key: string; label: string; url: string; icon: typeof Globe }[] = [];
  if (s.instagram) out.push({ key: "ig", label: "Instagram", url: norm(s.instagram, "https://instagram.com/"), icon: Instagram });
  if (s.telegramChannel) out.push({ key: "tg", label: "Telegram", url: norm(s.telegramChannel, "https://t.me/"), icon: Send });
  if (s.facebook) out.push({ key: "fb", label: "Facebook", url: norm(s.facebook, "https://facebook.com/"), icon: Facebook });
  if (s.youtube) out.push({ key: "yt", label: "YouTube", url: norm(s.youtube, "https://youtube.com/@"), icon: Youtube });
  if (s.tiktok) out.push({ key: "tt", label: "TikTok", url: norm(s.tiktok, "https://tiktok.com/@"), icon: Globe });
  if (s.whatsapp) out.push({ key: "wa", label: "WhatsApp", url: norm(s.whatsapp.replace(/[^\d]/g, ""), "https://wa.me/"), icon: Phone });
  if (s.website) out.push({ key: "web", label: "Website", url: norm(s.website, "https://"), icon: Globe });
  return out;
}

export function SocialRow() {
  const { data, embedded } = useStore();
  const links = socialLinks(data.config.social as unknown as Record<string, string>);
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <button
          key={l.key}
          type="button"
          onClick={() => !embedded && (l.url.startsWith("https://t.me/") ? openTelegram(l.url) : openExternal(l.url))}
          className="s-chip flex items-center gap-2 px-3 py-2 text-sm hover:border-sp/50"
        >
          <l.icon className="h-4 w-4 text-sp" /> {l.label}
        </button>
      ))}
    </div>
  );
}

export function Footer() {
  const { data, t } = useStore();
  const cfg = data.config;
  return (
    <footer className="mt-12 border-t border-sink/[0.07] pb-24 pt-8 @3xl:pb-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 @3xl:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <StoreLogo size={30} />
            <span className="font-head text-lg font-bold">{cfg.name}</span>
          </div>
          {cfg.description && <p className="mt-3 max-w-sm text-sm text-smu">{cfg.description}</p>}
          <div className="mt-4">
            <SocialRow />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm @3xl:grid-cols-1">
          {[...NAV.slice(1), { to: "/faq", key: "faq" as const }].map((n) => (
            <SLink key={n.to} to={n.to} className="text-smu hover:text-sink">
              {t[n.key]}
            </SLink>
          ))}
        </div>
        <div className="space-y-1.5 text-sm text-smu">
          {cfg.contacts.phone && <div>{cfg.contacts.phone}</div>}
          {cfg.contacts.telegram && <div>@{cfg.contacts.telegram}</div>}
          {cfg.contacts.address && <div>{cfg.contacts.address}</div>}
          {cfg.contacts.hours && <div>{cfg.contacts.hours}</div>}
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-6xl px-4 text-xs text-smu/70">
        © {new Date().getFullYear()} {cfg.name} · {t.madeWith}
      </div>
    </footer>
  );
}
