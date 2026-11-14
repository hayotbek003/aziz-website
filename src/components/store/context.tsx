"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICTS, type Dict } from "@/lib/i18n";
import type { Lang, Product, StoreData } from "@/lib/types";

export type StoreMode =
  | { kind: "routed"; base: string; path: string }
  | { kind: "embedded"; path: string; onNavigate: (p: string) => void };

type Ctx = {
  data: StoreData;
  t: Dict;
  lang: Lang;
  setLang: (l: Lang) => void;
  path: string;
  href: (p: string) => string;
  navigate: (p: string) => void;
  embedded: boolean;
  base: string;
  fav: (string | number)[];
  toggleFav: (id: string | number) => void;
  track: (type: "view" | "product_view" | "order_click", productId?: string | number) => void;
  productUrl: (p: Product) => string;
  searchFocus: boolean;
  setSearchFocus: (v: boolean) => void;
};

const StoreCtx = createContext<Ctx | null>(null);

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreCtx missing");
  return c;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({
  data,
  mode,
  onTrack,
  children,
}: {
  data: StoreData;
  mode: StoreMode;
  onTrack?: Ctx["track"];
  children: ReactNode;
}) {
  const shopLang = data.config.language === "uz" ? "uz" : "ru";
  const [lang, setLangState] = useState<Lang>(shopLang);
  const [fav, setFav] = useState<(string | number)[]>([]);
  const [searchFocus, setSearchFocus] = useState(false);
  const favKey = `aziz_fav_${data.slug}`;
  const langKey = `aziz_lang_${data.slug}`;

  useEffect(() => {
    setFav(readLS(favKey, []));
    if (mode.kind === "routed") setLangState(readLS<Lang>(langKey, shopLang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favKey]);

  // в редакторе язык всегда следует настройке магазина
  useEffect(() => {
    if (mode.kind === "embedded") setLangState(shopLang);
  }, [shopLang, mode.kind]);

  const setLang = useCallback(
    (l: Lang) => {
      setLangState(l);
      try {
        localStorage.setItem(langKey, JSON.stringify(l));
      } catch {}
    },
    [langKey],
  );

  const toggleFav = useCallback(
    (id: string | number) => {
      setFav((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        try {
          localStorage.setItem(favKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [favKey],
  );

  const router = useRouter();
  const base = mode.kind === "routed" ? mode.base : "";
  const value = useMemo<Ctx>(() => {
    const href = (p: string) => (mode.kind === "routed" ? `${mode.base}${p === "/" ? "" : p}` || "/" : p);
    return {
      data,
      t: DICTS[lang],
      lang,
      setLang,
      path: mode.path || "/",
      href,
      navigate: (p: string) => {
        if (mode.kind === "embedded") mode.onNavigate(p);
        else router.push(href(p));
      },
      embedded: mode.kind === "embedded",
      base,
      fav,
      toggleFav,
      track: onTrack || (() => {}),
      productUrl: (p: Product) =>
        typeof window === "undefined" ? "" : `${window.location.origin}${base}/product/${p.id}`,
      searchFocus,
      setSearchFocus,
    };
  }, [data, lang, setLang, mode, base, fav, toggleFav, onTrack, searchFocus, router]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/** Ссылка внутри витрины: обычная навигация Next.js или внутренняя (в предпросмотре редактора). */
export function SLink({
  to,
  className,
  children,
  onClick,
  ariaLabel,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const { embedded, navigate, href } = useStore();
  if (embedded) {
    return (
      <a
        href="#"
        aria-label={ariaLabel}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
          navigate(to);
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href(to)} className={className} onClick={onClick} aria-label={ariaLabel} scroll>
      {children}
    </Link>
  );
}
