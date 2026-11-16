"use client";
import { Bot, ChevronRight, Instagram, Link2, Megaphone, Phone, Send, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { mediaUrl } from "@/lib/format";
import { themeStyle } from "@/lib/theme";
import type { ShopConfig } from "@/lib/types";

/** Ссылка из «username», «@username», «t.me/username» или полного адреса. */
export function socialUrl(value: string, base: string) {
  const v = (value || "").trim();
  if (!v) return "";
  if (/^(https?:|tg:)/i.test(v)) return v;
  if (/^(t\.me|instagram\.com|www\.)/i.test(v)) return `https://${v}`;
  return `${base}${v.replace(/^@/, "")}`;
}

type Item = { key: string; label: string; sub?: string; url: string; icon: ReactNode; main?: boolean };

export function linkItems(cfg: ShopConfig, slug: string, botUsername: string | null, origin = ""): Item[] {
  const tg = (cfg.contacts.telegram || "").trim().replace(/^(https?:\/\/)?t\.me\//i, "").replace(/^@+/, "");
  const L = cfg.links;
  const uz = cfg.language === "uz";
  const out: Item[] = [];
  if (L.showShop) out.push({ key: "shop", label: uz ? "Internet-do'kon" : "Интернет-магазин", sub: uz ? "Katalog va narxlar" : "Каталог и цены", url: `${origin}/shop/${slug}`, icon: <ShoppingBag className="h-5 w-5" />, main: true });
  if (L.showTelegram && tg) out.push({ key: "tg", label: uz ? "Telegram'da yozish" : "Написать в Telegram", sub: `@${tg}`, url: `https://t.me/${tg}`, icon: <Send className="h-5 w-5" /> });
  if (L.showChannel && cfg.social.telegramChannel) out.push({ key: "channel", label: uz ? "Telegram-kanal" : "Telegram-канал", url: socialUrl(cfg.social.telegramChannel, "https://t.me/"), icon: <Megaphone className="h-5 w-5" /> });
  if (L.showBot && botUsername) out.push({ key: "bot", label: uz ? "Do'kon boti" : "Бот магазина", sub: `@${botUsername}`, url: `https://t.me/${botUsername}`, icon: <Bot className="h-5 w-5" /> });
  if (L.showInstagram && cfg.social.instagram) out.push({ key: "ig", label: "Instagram", url: socialUrl(cfg.social.instagram, "https://instagram.com/"), icon: <Instagram className="h-5 w-5" /> });
  if (L.showPhone && cfg.contacts.phone) out.push({ key: "phone", label: uz ? "Qo'ng'iroq qilish" : "Позвонить", sub: cfg.contacts.phone, url: `tel:${cfg.contacts.phone.replace(/[^\d+]/g, "")}`, icon: <Phone className="h-5 w-5" /> });
  L.items.forEach((it, i) => it.url && out.push({ key: `c${i}`, label: it.label || it.url, url: it.url, icon: <Link2 className="h-5 w-5" /> }));
  return out;
}

export default function LinkPage({ cfg, slug, botUsername, embedded }: { cfg: ShopConfig; slug: string; botUsername: string | null; embedded?: boolean }) {
  const items = linkItems(cfg, slug, botUsername);
  const title = cfg.links.title || cfg.name;
  const bio = cfg.links.bio || cfg.tagline || cfg.description;
  return (
    <div style={themeStyle(cfg.theme)} data-card={cfg.theme.cardStyle} className={embedded ? "store min-h-full" : "store min-h-dvh"}>
      <div className="mx-auto flex max-w-md flex-col items-center px-5 pb-10 pt-12">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-ssf shadow-lg ring-4 ring-sp/30">
          {cfg.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cfg.logo)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-head text-3xl font-bold text-sp">{title.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <h1 className="mt-4 text-center font-head text-2xl font-bold">{title}</h1>
        {bio && <p className="mt-2 whitespace-pre-line text-center text-sm text-smu">{bio}</p>}
        <div className="mt-7 flex w-full flex-col gap-3">
          {items.map((it) => (
            <a
              key={it.key}
              href={embedded ? undefined : it.url}
              target={it.url.startsWith("/") || it.url.startsWith("tel:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className={
                it.main
                  ? "s-btn flex items-center gap-3 px-4 py-4 font-bold transition hover:scale-[1.01]"
                  : "s-card flex items-center gap-3 px-4 py-3.5 font-semibold transition hover:scale-[1.01]"
              }
            >
              <span className={it.main ? "grid h-9 w-9 place-items-center rounded-full bg-black/10" : "grid h-9 w-9 place-items-center rounded-full bg-sp/15 text-sp"}>{it.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{it.label}</span>
                {it.sub && <span className={it.main ? "block truncate text-xs font-medium opacity-80" : "block truncate text-xs font-medium text-smu"}>{it.sub}</span>}
              </span>
              <ChevronRight className="h-4 w-4 opacity-60" />
            </a>
          ))}
          {!items.length && <p className="text-center text-sm text-smu">Ссылки пока не добавлены</p>}
        </div>
        <a href="/" className="mt-10 text-[11px] text-smu opacity-70">
          AZIZ Website
        </a>
      </div>
    </div>
  );
}
