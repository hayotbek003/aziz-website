"use client";
import {
  ChevronLeft, Eye, LayoutTemplate, Monitor, Palette, Redo2, RotateCcw, Rows3, Save, Settings2, Smartphone, Store,
  Undo2, UploadCloud, FileText,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Spinner, useUi } from "@/components/panel/ui";
import type { ShopFull } from "@/components/panel/useShop";
import Storefront from "@/components/store/Storefront";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { normalizeConfig } from "@/lib/templates";
import { openExternal } from "@/lib/telegram";
import type { ShopConfig, ShopSummary, StoreData } from "@/lib/types";
import { BlocksPanel, DesignPanel, HomePanel, InfoPanel, PagesPanel } from "./Panels";
import { PreviewFrame } from "./PreviewFrame";

/** Иммутабельная запись по пути "theme.primary" / "banners.0.title". */
function setIn<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const root: unknown = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) };
  let cur = root as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    cur[k] = Array.isArray(next) ? [...next] : { ...(next as object) };
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

const TABS = [
  { key: "design", label: "Дизайн", icon: Palette },
  { key: "home", label: "Главная", icon: LayoutTemplate },
  { key: "blocks", label: "Блоки", icon: Rows3 },
  { key: "pages", label: "Страницы", icon: FileText },
  { key: "info", label: "Магазин", icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Editor({ initial }: { initial: ShopFull }) {
  const { toast, confirm } = useUi();
  const [shop, setShop] = useState<ShopSummary>(initial.shop);
  const [cfg, setCfg] = useState<ShopConfig>(initial.draft);
  const [saved, setSaved] = useState(() => JSON.stringify(initial.draft));
  const [published, setPublished] = useState(() => JSON.stringify(initial.published ?? initial.draft));
  const [tab, setTab] = useState<TabKey>("design");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [previewPath, setPreviewPath] = useState("/");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<"" | "save" | "publish" | "discard" | "preview">("");
  const history = useRef<ShopConfig[]>([]);
  const future = useRef<ShopConfig[]>([]);
  const lastEdit = useRef<{ path: string; t: number } | null>(null);
  const [, force] = useState(0);

  const current = JSON.stringify(cfg);
  const dirty = current !== saved;
  const unpublished = current !== published;

  const update = useCallback((path: string, value: unknown) => {
    setCfg((prev) => {
      const now = Date.now();
      const le = lastEdit.current;
      if (!(le && le.path === path && now - le.t < 900)) {
        history.current.push(prev);
        if (history.current.length > 150) history.current.shift();
      }
      lastEdit.current = { path, t: now };
      future.current = [];
      return setIn(prev, path, value);
    });
    force((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    setCfg((cur) => {
      future.current.push(cur);
      return prev;
    });
    lastEdit.current = null;
    force((x) => x + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setCfg((cur) => {
      history.current.push(cur);
      return next;
    });
    lastEdit.current = null;
    force((x) => x + 1);
  }, []);

  const save = useCallback(async (silent = false) => {
    setBusy("save");
    try {
      const r = await api<{ shop: ShopSummary }>(`/api/me/shops/${shop.id}/draft`, { method: "PUT", body: { config: cfg } });
      setSaved(JSON.stringify(cfg));
      setShop(r.shop);
      if (!silent) toast("Изменения сохранены");
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    } finally {
      setBusy("");
    }
  }, [cfg, shop.id, toast]);

  const publish = async () => {
    setBusy("publish");
    try {
      const r = await api<{ shop: ShopSummary }>(`/api/me/shops/${shop.id}/publish`, { body: { config: cfg } });
      const json = JSON.stringify(cfg);
      setSaved(json);
      setPublished(json);
      setShop(r.shop);
      toast("Опубликовано! Покупатели уже видят изменения");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const discard = async () => {
    const ok = await confirm("Отменить все неопубликованные изменения и вернуть опубликованную версию сайта?", { danger: true, ok: "Отменить изменения" });
    if (!ok) return;
    setBusy("discard");
    try {
      const r = await api<{ draft: ShopConfig; shop: ShopSummary }>(`/api/me/shops/${shop.id}/discard`, { body: {} });
      const d = normalizeConfig(r.draft);
      history.current.push(cfg);
      setCfg(d);
      const json = JSON.stringify(d);
      setSaved(json);
      setPublished(json);
      setShop(r.shop);
      toast("Изменения отменены");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const openPreview = async () => {
    // окно открываем сразу (иначе браузер блокирует pop-up), URL подставляем после сохранения
    const win = typeof window !== "undefined" && !window.Telegram?.WebApp?.initData ? window.open("about:blank", "_blank") : null;
    if (dirty && !(await save(true))) {
      win?.close();
      return;
    }
    setBusy("preview");
    try {
      const r = await api<{ url: string }>(`/api/me/shops/${shop.id}/preview-token`, { body: {} });
      const url = r.url.replace(/^https?:\/\/[^/]+/, window.location.origin) + (previewPath !== "/" ? "" : "");
      if (win) win.location.href = url;
      else openExternal(url);
    } catch (e) {
      win?.close();
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  // Горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const inField = (e.target as HTMLElement)?.closest("input, textarea");
      if (k === "s") {
        e.preventDefault();
        save();
      } else if (k === "z" && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y" && !inField) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, undo, redo]);

  // Предупреждение о несохранённых изменениях
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const store: StoreData = useMemo(
    () => ({ id: shop.id, slug: shop.slug, template: shop.template, config: cfg, categories: initial.categories, products: initial.products }),
    [shop.id, shop.slug, shop.template, cfg, initial.categories, initial.products],
  );

  const firstProduct = initial.products[0]?.id;
  const firstCat = initial.categories[0]?.slug;
  const pageOptions = [
    { value: "/", label: "Главная" },
    { value: "/catalog", label: "Каталог" },
    ...(firstCat ? [{ value: `/catalog/${firstCat}`, label: "Категория" }] : []),
    ...(firstProduct ? [{ value: `/product/${firstProduct}`, label: "Страница товара" }] : []),
    { value: "/about", label: "О магазине" },
    { value: "/contacts", label: "Контакты" },
    { value: "/delivery", label: "Доставка" },
    { value: "/faq", label: "Частые вопросы" },
    { value: "/favorites", label: "Избранное" },
  ];
  if (!pageOptions.some((o) => o.value === previewPath)) pageOptions.push({ value: previewPath, label: previewPath });

  const panelProps = { cfg, update, shopId: shop.id, setPreview: setPreviewPath, categories: initial.categories, products: initial.products };
  const statusText = dirty ? "Не сохранено" : unpublished ? "Сохранено · не опубликовано" : "Опубликовано";

  return (
    <div className="flex h-dvh flex-col bg-ink-950">
      {/* Верхняя панель */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-ink-900/90 px-2 backdrop-blur sm:px-3">
        <Link href={`/panel/shop/${shop.id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/5" aria-label="Назад">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight">{cfg.name || shop.slug}</div>
          <div className={cx("flex items-center gap-1.5 text-[11px]", dirty ? "text-amber-300" : unpublished ? "text-sky-300" : "text-emerald-400")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", dirty ? "bg-amber-300" : unpublished ? "bg-sky-300" : "bg-emerald-400")} />
            {statusText}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={undo} disabled={!history.current.length} className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5 disabled:opacity-30" title="Шаг назад (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={redo} disabled={!future.current.length} className="hidden h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/5 disabled:opacity-30 sm:grid" title="Повторить (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </button>
          <Button size="sm" variant="ghost" onClick={discard} loading={busy === "discard"} disabled={!unpublished || !!busy} icon={<RotateCcw className="h-4 w-4" />} className="px-2 sm:px-3" title="Отменить изменения">
            <span className="hidden md:inline">Отменить изменения</span>
          </Button>
          <Button size="sm" onClick={() => save()} loading={busy === "save"} disabled={!dirty || !!busy} icon={<Save className="h-4 w-4" />} className="px-2 sm:px-3" title="Сохранить (Ctrl+S)">
            <span className="hidden sm:inline">Сохранить</span>
          </Button>
          <Button size="sm" onClick={openPreview} loading={busy === "preview"} disabled={!!busy} icon={<Eye className="h-4 w-4" />} className="hidden px-3 sm:inline-flex" title="Открыть черновик в новой вкладке">
            <span className="hidden lg:inline">Предпросмотр</span>
          </Button>
          <Button size="sm" variant="gold" onClick={publish} loading={busy === "publish"} disabled={!unpublished || !!busy} icon={<UploadCloud className="h-4 w-4" />}>
            Опубликовать
          </Button>
        </div>
      </header>

      {/* Переключатель для телефона */}
      <div className="flex shrink-0 gap-1 border-b border-white/5 bg-ink-900 p-1.5 lg:hidden">
        {(["edit", "preview"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            className={cx("flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold", mobileView === v ? "bg-gold text-black" : "text-ink-300")}
          >
            {v === "edit" ? <Settings2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {v === "edit" ? "Настройки" : "Просмотр"}
          </button>
        ))}
        <button type="button" onClick={openPreview} className="grid w-10 place-items-center rounded-lg text-ink-300 sm:hidden" aria-label="Предпросмотр в новом окне">
          <Store className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Левая панель: инструменты */}
        <aside className={cx("min-h-0 w-full shrink-0 flex-col border-r border-white/5 bg-ink-900/60 lg:flex lg:w-[400px]", mobileView === "edit" ? "flex" : "hidden")}>
          <nav className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-white/5 p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cx("flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition sm:flex-1", tab === t.key ? "bg-gold/15 text-gold" : "text-ink-400 hover:text-ink-100")}
              >
                <t.icon className="h-[18px] w-[18px]" />
                {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-6">
            {tab === "design" && <DesignPanel {...panelProps} />}
            {tab === "home" && <HomePanel {...panelProps} />}
            {tab === "blocks" && <BlocksPanel {...panelProps} />}
            {tab === "pages" && <PagesPanel {...panelProps} />}
            {tab === "info" && <InfoPanel {...panelProps} />}
            <div className="px-4 pt-4 text-xs leading-relaxed text-ink-500">
              Товары, фото и цены —{" "}
              <Link href={`/panel/shop/${shop.id}/products`} className="text-gold hover:underline">
                в разделе «Товары»
              </Link>
              . Они сохраняются сразу, а дизайн — после «Опубликовать».
            </div>
          </div>
        </aside>

        {/* Правая панель: живой предпросмотр */}
        <section className={cx("min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(245,165,36,0.07),transparent_50%)] lg:flex", mobileView === "preview" ? "flex" : "hidden")}>
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <Select value={previewPath} onChange={setPreviewPath} options={pageOptions} className="w-48" />
            <div className="ml-auto hidden rounded-xl border border-white/10 bg-ink-900 p-1 lg:flex">
              {(["phone", "desktop"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDevice(d)} className={cx("grid h-8 w-10 place-items-center rounded-lg", device === d ? "bg-gold text-black" : "text-ink-400")} title={d === "phone" ? "Телефон" : "Компьютер"}>
                  {d === "phone" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 justify-center px-0 pb-0 lg:px-6 lg:pb-6">
            {device === "phone" ? (
              <div className="h-full w-full lg:max-w-[400px] lg:rounded-[2.4rem] lg:border lg:border-white/10 lg:bg-black lg:p-2.5 lg:shadow-[0_30px_80px_-30px_rgba(245,165,36,0.35)]">
                <PreviewFrame width={390} className="h-full w-full lg:rounded-[1.9rem]">
                  <Storefront data={store} mode={{ kind: "embedded", path: previewPath, onNavigate: setPreviewPath }} />
                </PreviewFrame>
              </div>
            ) : (
              <div className="h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
                <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-ink-850 px-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                  <span className="ml-3 truncate text-[11px] text-ink-400">{shop.url}</span>
                </div>
                <PreviewFrame width={1280} className="h-[calc(100%-1.75rem)] w-full">
                  <Storefront data={store} mode={{ kind: "embedded", path: previewPath, onNavigate: setPreviewPath }} />
                </PreviewFrame>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function EditorLoading() {
  return (
    <div className="grid h-dvh place-items-center">
      <Spinner className="text-gold" />
    </div>
  );
}
