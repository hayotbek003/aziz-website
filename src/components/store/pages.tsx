"use client";
import { ArrowRight, ChevronDown, ChevronLeft, Clock, Heart, Mail, MapPin, Phone, Search, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, mediaUrl } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { openExternal, openTelegram } from "@/lib/telegram";
import type { Product } from "@/lib/types";
import { SLink, useStore } from "./context";
import { OrderButton, Price, ProductArt, ProductCard, ProductGrid, ProductImage, SectionTitle, SocialRow } from "./parts";

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("mx-auto max-w-6xl px-4", className)}>{children}</div>;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-sink/85">
      {text
        .split(/\n{2,}|\n/)
        .filter((x) => x.trim())
        .map((x, i) => (
          <p key={i}>{x}</p>
        ))}
    </div>
  );
}

/* ---------- Главная: hero ---------- */
function HeroArt() {
  const { data } = useStore();
  const art = data.config.hero.art || "Sparkles";
  const chips = data.categories.slice(0, 3);
  return (
    <div className="relative h-full w-full">
      <div className="absolute right-[8%] top-1/2 aspect-square w-[78%] -translate-y-1/2 rounded-full bg-sp/30 blur-3xl" />
      <div className="absolute right-[12%] top-1/2 grid aspect-square w-[64%] -translate-y-1/2 place-items-center rounded-full border border-sink/10 bg-gradient-to-br from-sp/25 via-ssf/40 to-sp2/10">
        <Icon name={art} className="s-glow h-[58%] w-[58%] animate-float text-sp2" strokeWidth={1.1} />
      </div>
      {chips.map((c, i) => (
        <div
          key={c.id}
          className="s-card absolute grid h-11 w-11 place-items-center @3xl:h-14 @3xl:w-14"
          style={{
            top: ["14%", "62%", "30%"][i],
            right: ["70%", "66%", "4%"][i],
            animation: `float ${4 + i}s ease-in-out ${i * 0.6}s infinite`,
          }}
        >
          <Icon name={c.icon} className="h-5 w-5 text-sp @3xl:h-6 @3xl:w-6" />
        </div>
      ))}
    </div>
  );
}

function Hero() {
  const { data } = useStore();
  const h = data.config.hero;
  const center = h.layout === "center";
  return (
    <Container className="pt-4 @3xl:pt-8">
      <section className="s-card relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sp/25 via-transparent to-sp2/10" />
        <div
          className={cx(
            "absolute inset-y-0 right-0 -z-10",
            center ? "inset-x-0 opacity-40" : "w-[55%] @3xl:w-1/2",
          )}
        >
          {h.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(h.image)} alt="" className="h-full w-full object-cover" />
          ) : (
            <HeroArt />
          )}
          {!center && <div className="absolute inset-0 bg-gradient-to-r from-ssf via-ssf/40 to-transparent" />}
          {center && <div className="absolute inset-0 bg-sbg/40" />}
        </div>
        <div
          className={cx(
            "flex min-h-[230px] flex-col justify-center gap-3 p-5 @md:min-h-[260px] @3xl:min-h-[400px] @3xl:p-12",
            center ? "items-center text-center" : "max-w-[62%] @3xl:max-w-[55%]",
          )}
        >
          <h1 className="text-[26px] font-black leading-[1.08] @md:text-3xl @3xl:text-5xl @5xl:text-6xl">{h.title || data.config.name}</h1>
          {h.tags && <p className="text-xs font-medium text-sink/80 @3xl:text-base">{h.tags}</p>}
          {h.subtitle && <p className="hidden text-sm text-smu @md:block @3xl:text-lg">{h.subtitle}</p>}
          <div>
            <SLink to="/catalog" className="s-btn mt-1 inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold @3xl:px-6 @3xl:py-3 @3xl:text-base">
              {h.button || "Каталог"} <ArrowRight className="h-4 w-4" />
            </SLink>
          </div>
        </div>
      </section>
    </Container>
  );
}

function Categories() {
  const { data, t } = useStore();
  if (!data.categories.length) return null;
  return (
    <Container className="mt-5 @3xl:mt-10">
      <div className="mb-3 hidden @3xl:block">
        <SectionTitle title={t.categories} to="/catalog" action={t.viewAll} />
      </div>
      <div className="grid grid-cols-4 gap-2.5 @3xl:grid-cols-6 @3xl:gap-4 @5xl:grid-cols-8">
        {data.categories.map((c) => (
          <SLink key={c.id} to={`/catalog/${c.slug}`} className="s-card s-card-hover flex flex-col items-center gap-1.5 overflow-hidden px-1 py-3 text-center @3xl:py-5">
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(c.image)} alt="" className="h-9 w-9 rounded-lg object-cover @3xl:h-12 @3xl:w-12" />
            ) : (
              <Icon name={c.icon} className="h-7 w-7 text-sp @3xl:h-9 @3xl:w-9" strokeWidth={1.6} />
            )}
            <span className="line-clamp-1 w-full text-[11px] font-medium @3xl:text-sm">{c.name}</span>
          </SLink>
        ))}
      </div>
    </Container>
  );
}

function Banners() {
  const { data } = useStore();
  const items = data.config.banners.filter((b) => b.image || b.title);
  if (!items.length) return null;
  return (
    <Container className="mt-6 @3xl:mt-10">
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {items.map((b) => {
          const inner = (
            <div className="s-card relative aspect-[2.2/1] w-[86%] shrink-0 snap-center overflow-hidden @3xl:aspect-[3/1] @3xl:w-[70%]">
              {b.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(b.image)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="s-art absolute inset-0" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
              <div className="relative flex h-full flex-col justify-end gap-1 p-4 text-white @3xl:p-8">
                {b.title && <div className="font-head text-lg font-bold leading-tight @3xl:text-3xl">{b.title}</div>}
                {b.subtitle && <div className="text-xs text-white/80 @3xl:text-base">{b.subtitle}</div>}
              </div>
            </div>
          );
          return b.link ? (
            <SLink key={b.id} to={b.link} className="contents">
              {inner}
            </SLink>
          ) : (
            <div key={b.id} className="contents">
              {inner}
            </div>
          );
        })}
      </div>
    </Container>
  );
}

function Features() {
  const { data } = useStore();
  const f = data.config.features;
  if (!f.length) return null;
  return (
    <Container className="mt-6 @3xl:mt-10">
      <div className="s-card grid grid-cols-3 divide-x divide-sink/10 px-1 py-3 @3xl:py-5" style={{ gridTemplateColumns: `repeat(${Math.min(f.length, 6)}, minmax(0,1fr))` }}>
        {f.map((x, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 px-1 text-center @3xl:flex-row @3xl:justify-center @3xl:gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-sp/15 @3xl:h-10 @3xl:w-10">
              <Icon name={x.icon} className="h-4 w-4 text-sp @3xl:h-5 @3xl:w-5" />
            </span>
            <span className="text-[11px] font-medium leading-tight @3xl:text-sm">{x.text}</span>
          </div>
        ))}
      </div>
    </Container>
  );
}

function sortPopular(a: Product, b: Product) {
  return Number(b.isPopular) - Number(a.isPopular) || a.sort - b.sort;
}

function PopularSection() {
  const { data, t } = useStore();
  const items = useMemo(() => {
    const pop = data.products.filter((p) => p.isPopular);
    return (pop.length ? pop : [...data.products].sort(sortPopular)).slice(0, 10);
  }, [data.products]);
  if (!items.length) return null;
  return (
    <Container className="mt-7 @3xl:mt-12">
      <SectionTitle title={t.popular} to="/catalog" action={t.viewAll} />
      <ProductGrid items={items} />
    </Container>
  );
}

function NewSection() {
  const { data, t } = useStore();
  const items = useMemo(
    () => [...data.products].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5),
    [data.products],
  );
  if (!items.length) return null;
  return (
    <Container className="mt-7 @3xl:mt-12">
      <SectionTitle title={t.newItems} to="/catalog" action={t.viewAll} />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((p) => (
          <div key={p.id} className="w-[44%] shrink-0 @xl:w-[30%] @3xl:w-[22%] @5xl:w-[18%]">
            <ProductCard p={p} />
          </div>
        ))}
      </div>
    </Container>
  );
}

function AboutSection() {
  const { data, t } = useStore();
  const a = data.config.pages.about;
  if (!a.text) return null;
  return (
    <Container className="mt-7 @3xl:mt-12">
      <div className="s-card grid gap-4 overflow-hidden p-5 @3xl:grid-cols-2 @3xl:p-8">
        <div>
          <h2 className="mb-3 text-lg font-bold @3xl:text-2xl">{a.title}</h2>
          <p className="line-clamp-5 text-sm leading-relaxed text-sink/80">{a.text}</p>
          <SLink to="/about" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sp">
            {t.more} <ArrowRight className="h-4 w-4" />
          </SLink>
        </div>
        {a.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(a.image)} alt="" className="s-r-sm h-48 w-full object-cover @3xl:h-full" />
        )}
      </div>
    </Container>
  );
}

function ContactsSection() {
  const { data, t } = useStore();
  return (
    <Container className="mt-7 @3xl:mt-12">
      <div className="s-card flex flex-col gap-4 p-5 @3xl:flex-row @3xl:items-center @3xl:justify-between @3xl:p-8">
        <div>
          <h2 className="text-lg font-bold @3xl:text-2xl">{t.contacts}</h2>
          <p className="mt-1 text-sm text-smu">{[data.config.contacts.phone, data.config.contacts.address].filter(Boolean).join(" · ")}</p>
        </div>
        <SLink to="/contacts" className="s-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold">
          <Send className="h-4 w-4" /> {t.writeUs}
        </SLink>
      </div>
    </Container>
  );
}

export function HomePage() {
  const { data } = useStore();
  const map: Record<string, () => React.ReactNode> = {
    hero: () => <Hero />,
    categories: () => <Categories />,
    banners: () => <Banners />,
    popular: () => <PopularSection />,
    features: () => <Features />,
    new: () => <NewSection />,
    about: () => <AboutSection />,
    contacts: () => <ContactsSection />,
  };
  return (
    <div>
      {data.config.sections
        .filter((s) => s.visible && map[s.id])
        .map((s) => (
          <div key={s.id} data-section={s.id}>
            {map[s.id]()}
          </div>
        ))}
    </div>
  );
}

/* ---------- Каталог и категории ---------- */
export function CatalogPage({ categorySlug }: { categorySlug?: string }) {
  const { data, t, searchFocus, setSearchFocus } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("popular");
  const [onlyStock, setOnlyStock] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cat = categorySlug ? data.categories.find((c) => c.slug === categorySlug) : undefined;

  useEffect(() => {
    if (searchFocus) {
      inputRef.current?.focus();
      setSearchFocus(false);
    }
  }, [searchFocus, setSearchFocus]);

  const items = useMemo(() => {
    let list = data.products.filter((p) => (cat ? p.categoryId === cat.id : true));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s));
    }
    if (onlyStock) list = list.filter((p) => p.inStock);
    const sorted = [...list];
    if (sort === "cheap") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "expensive") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "new") sorted.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    else sorted.sort(sortPopular);
    return sorted;
  }, [data.products, cat, q, sort, onlyStock]);

  const page = data.config.pages.catalog;
  return (
    <Container className="pt-5 @3xl:pt-8">
      {cat && (
        <SLink to="/catalog" className="mb-2 inline-flex items-center gap-1 text-sm text-smu hover:text-sink">
          <ChevronLeft className="h-4 w-4" /> {t.catalog}
        </SLink>
      )}
      <div className="flex items-center gap-3">
        {cat && (
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sp/15">
            <Icon name={cat.icon} className="h-6 w-6 text-sp" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-black @3xl:text-4xl">{cat ? cat.name : page.title || t.catalog}</h1>
          <p className="text-sm text-smu">{cat ? cat.description || `${items.length} ${t.goods}` : page.subtitle || `${items.length} ${t.goods}`}</p>
        </div>
      </div>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-smu" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="s-input text-sm" />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <SLink to="/catalog" className="shrink-0">
          <span data-active={!cat} className="s-chip inline-flex px-4 py-1.5 text-[13px] font-semibold">{t.all}</span>
        </SLink>
        {data.categories.map((c) => (
          <SLink key={c.id} to={`/catalog/${c.slug}`} className="shrink-0">
            <span data-active={cat?.id === c.id} className="s-chip inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold">
              <Icon name={c.icon} className="h-3.5 w-3.5" /> {c.name}
            </span>
          </SLink>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
        <label className="flex cursor-pointer items-center gap-2 text-smu">
          <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} className="accent-[rgb(var(--c-primary))]" />
          {t.onlyInStock}
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="s-chip bg-ssf px-3 py-1.5 text-[13px] text-sink outline-none">
          <option value="popular">{t.sortPopular}</option>
          <option value="cheap">{t.sortCheap}</option>
          <option value="expensive">{t.sortExpensive}</option>
          <option value="new">{t.sortNew}</option>
        </select>
      </div>
      <div className="mt-4">
        <ProductGrid items={items} />
      </div>
    </Container>
  );
}

/* ---------- Страница товара ---------- */
export function ProductPage({ id }: { id: string }) {
  const { data, t, fav, toggleFav, track } = useStore();
  const p = data.products.find((x) => String(x.id) === id);
  const [idx, setIdx] = useState(0);
  const trackedRef = useRef<string | null>(null);
  useEffect(() => {
    setIdx(0);
    if (p && trackedRef.current !== String(p.id)) {
      trackedRef.current = String(p.id);
      track("product_view", p.id);
    }
  }, [p, track]);
  if (!p) return <NotFound />;
  const cat = data.categories.find((c) => c.id === p.categoryId);
  const similar = data.products.filter((x) => x.id !== p.id && x.categoryId === p.categoryId).slice(0, 4);
  const page = data.config.pages.product;
  const isFav = fav.includes(p.id);
  const images = p.images || [];
  return (
    <Container className="pt-4 @3xl:pt-8">
      <SLink to={cat ? `/catalog/${cat.slug}` : "/catalog"} className="mb-3 inline-flex items-center gap-1 text-sm text-smu hover:text-sink">
        <ChevronLeft className="h-4 w-4" /> {cat?.name || t.catalog}
      </SLink>
      <div className="grid gap-5 @3xl:grid-cols-2 @3xl:gap-10">
        <div>
          <div className="s-card relative aspect-square overflow-hidden">
            {images.length ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(images[Math.min(idx, images.length - 1)])} alt={p.name} className="h-full w-full object-cover" />
            ) : (
              <ProductArt icon={p.icon} className="h-full w-full" big />
            )}
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {images.map((im, i) => (
                <button key={im + i} type="button" onClick={() => setIdx(i)} className={cx("s-r-sm h-16 w-16 shrink-0 overflow-hidden border-2", i === idx ? "border-sp" : "border-transparent opacity-70")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(im)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {cat && <span className="s-chip px-2.5 py-0.5 text-xs">{cat.name}</span>}
              <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", p.inStock ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                {p.inStock ? (p.stockQty ? `${t.inStock}: ${p.stockQty}` : t.inStock) : t.outOfStock}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-black leading-tight @3xl:text-4xl">{p.name}</h1>
          </div>
          <Price p={p} big />
          {p.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-sink/80">{p.description}</p>}
          <div className="flex gap-2">
            <OrderButton p={p} className="flex-1" />
            <button
              type="button"
              aria-label={t.addFav}
              onClick={() => toggleFav(p.id)}
              className={cx("s-chip grid h-[52px] w-[52px] shrink-0 place-items-center", isFav && "text-sp")}
            >
              <Heart className="h-5 w-5" fill={isFav ? "currentColor" : "none"} />
            </button>
          </div>
          {page.note && <div className="s-card p-3 text-sm text-smu">{page.note}</div>}
          {page.showSpecs && p.specs.length > 0 && (
            <div className="s-card overflow-hidden">
              <div className="border-b border-sink/10 px-4 py-3 font-head font-bold">{t.specs}</div>
              <dl className="divide-y divide-sink/[0.06]">
                {p.specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 px-4 py-2.5 text-sm">
                    <dt className="text-smu">{s.k}</dt>
                    <dd className="font-medium">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
      {page.showSimilar && similar.length > 0 && (
        <div className="mt-10">
          <SectionTitle title={t.similar} />
          <ProductGrid items={similar} />
        </div>
      )}
    </Container>
  );
}

/* ---------- Информационные страницы ---------- */
function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-black @3xl:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-smu">{subtitle}</p>}
    </div>
  );
}

export function AboutPage() {
  const { data } = useStore();
  const a = data.config.pages.about;
  return (
    <Container className="pt-5 @3xl:pt-10">
      <PageHead title={a.title} subtitle={data.config.tagline} />
      <div className="grid gap-6 @3xl:grid-cols-[1.2fr_1fr]">
        <div className="s-card p-5 @3xl:p-8">
          <Paragraphs text={a.text || data.config.description} />
        </div>
        <div className="s-card overflow-hidden">
          {a.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(a.image)} alt="" className="h-full max-h-96 w-full object-cover" />
          ) : (
            <ProductArt icon={data.config.hero.art} className="h-64 w-full @3xl:h-full" big />
          )}
        </div>
      </div>
      {data.config.features.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 @xl:grid-cols-3">
          {data.config.features.map((f, i) => (
            <div key={i} className="s-card flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-sp/15">
                <Icon name={f.icon} className="h-5 w-5 text-sp" />
              </span>
              <span className="font-semibold">{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}

export function DeliveryPage() {
  const { data } = useStore();
  const d = data.config.pages.delivery;
  return (
    <Container className="pt-5 @3xl:pt-10">
      <PageHead title={d.title} subtitle={d.text} />
      <div className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">
        {d.items.map((it, i) => (
          <div key={i} className="s-card flex gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sp/15">
              <Icon name={it.icon} className="h-6 w-6 text-sp" />
            </span>
            <div>
              <div className="font-head font-bold">{it.title}</div>
              <div className="mt-1 text-sm text-smu">{it.text}</div>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

export function FaqPage() {
  const { data } = useStore();
  const f = data.config.pages.faq;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Container className="max-w-3xl pt-5 @3xl:pt-10">
      <PageHead title={f.title} />
      <div className="space-y-2.5">
        {f.items.map((it, i) => (
          <div key={i} className="s-card overflow-hidden">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left font-semibold">
              {it.q}
              <ChevronDown className={cx("h-5 w-5 shrink-0 text-sp transition", open === i && "rotate-180")} />
            </button>
            {open === i && <div className="animate-fadein px-4 pb-4 text-sm leading-relaxed text-smu">{it.a}</div>}
          </div>
        ))}
      </div>
    </Container>
  );
}

export function ContactsPage() {
  const { data, t, embedded } = useStore();
  const c = data.config.contacts;
  const page = data.config.pages.contacts;
  const rows = [
    c.telegram && { icon: Send, label: "Telegram", value: `@${c.telegram}`, act: () => openTelegram(`https://t.me/${c.telegram}`) },
    c.phone && { icon: Phone, label: t.phone, value: c.phone, act: () => (window.location.href = `tel:${c.phone.replace(/[^\d+]/g, "")}`) },
    c.email && { icon: Mail, label: t.email, value: c.email, act: () => (window.location.href = `mailto:${c.email}`) },
    c.address && { icon: MapPin, label: t.address, value: c.address, act: () => openExternal(`https://maps.google.com/?q=${encodeURIComponent(c.address)}`) },
    c.hours && { icon: Clock, label: t.hours, value: c.hours, act: null },
  ].filter(Boolean) as { icon: typeof Send; label: string; value: string; act: (() => void) | null }[];
  return (
    <Container className="max-w-3xl pt-5 @3xl:pt-10">
      <PageHead title={page.title} subtitle={page.text} />
      <div className="space-y-2.5">
        {rows.map((r) => (
          <button
            key={r.label}
            type="button"
            disabled={!r.act}
            onClick={() => !embedded && r.act?.()}
            className="s-card flex w-full items-center gap-4 p-4 text-left enabled:hover:border-sp/50"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sp/15">
              <r.icon className="h-5 w-5 text-sp" />
            </span>
            <span>
              <span className="block text-xs text-smu">{r.label}</span>
              <span className="block font-semibold">{r.value}</span>
            </span>
          </button>
        ))}
      </div>
      {c.telegram && (
        <button
          type="button"
          onClick={() => !embedded && openTelegram(`https://t.me/${c.telegram}`)}
          className="s-btn mt-5 flex w-full items-center justify-center gap-2 py-3.5 font-bold"
        >
          <Send className="h-5 w-5" /> {t.writeUs}
        </button>
      )}
      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold text-smu">{t.socials}</div>
        <SocialRow />
      </div>
    </Container>
  );
}

export function FavoritesPage() {
  const { data, t, fav } = useStore();
  const items = data.products.filter((p) => fav.includes(p.id));
  return (
    <Container className="pt-5 @3xl:pt-10">
      <PageHead title={t.favorites} />
      {items.length ? (
        <ProductGrid items={items} />
      ) : (
        <div className="s-card flex flex-col items-center gap-3 p-10 text-center">
          <Heart className="h-10 w-10 text-sp" />
          <p className="text-smu">{t.emptyFav}</p>
          <SLink to="/catalog" className="s-btn px-5 py-2.5 text-sm font-bold">
            {t.catalog}
          </SLink>
        </div>
      )}
    </Container>
  );
}

export function NotFound() {
  const { t } = useStore();
  return (
    <Container className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="font-head text-6xl font-black text-sp">404</div>
      <p className="text-smu">{t.notFound}</p>
      <SLink to="/" className="s-btn px-5 py-2.5 text-sm font-bold">
        {t.toHome}
      </SLink>
    </Container>
  );
}

export { ProductImage };
