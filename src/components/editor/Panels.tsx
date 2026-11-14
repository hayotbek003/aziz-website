"use client";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ColorInput, Field, IconPicker, ImageInput, Segmented, Select, TextArea, TextInput, Toggle } from "@/components/panel/ui";
import { cx, uid } from "@/lib/format";
import { PRESETS } from "@/lib/templates";
import { FONTS, fontVar } from "@/lib/theme";
import type { Category, Product, SectionId, ShopConfig } from "@/lib/types";

export type Update = (path: string, value: unknown) => void;
type P = { cfg: ShopConfig; update: Update; shopId: number; setPreview: (p: string) => void; categories: Category[]; products: Product[] };

export function Group({ title, children, defaultOpen = true, onOpen }: { title: string; children: ReactNode; defaultOpen?: boolean; onOpen?: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-white/5">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) onOpen?.();
        }}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[13px] font-bold uppercase tracking-wider text-ink-300 hover:text-ink-100"
      >
        {title}
        <ChevronDown className={cx("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3.5 px-4 pb-5">{children}</div>}
    </section>
  );
}

function RowTools({ onUp, onDown, onDelete }: { onUp?: () => void; onDown?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex gap-1">
      {onUp && (
        <button type="button" onClick={onUp} className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-ink-300 hover:text-ink-100" aria-label="Выше">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      )}
      {onDown && (
        <button type="button" onClick={onDown} className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-ink-300 hover:text-ink-100" aria-label="Ниже">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className="grid h-7 w-7 place-items-center rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20" aria-label="Удалить">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const next = [...arr];
  const j = i + d;
  if (j < 0 || j >= next.length) return arr;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* ================= Дизайн ================= */
export function DesignPanel({ cfg, update, shopId }: P) {
  const t = cfg.theme;
  return (
    <>
      <Group title="Название и логотип">
        <Field label="Название магазина">
          <TextInput value={cfg.name} onChange={(e) => update("name", e.target.value)} maxLength={80} />
        </Field>
        <Field label="Слоган">
          <TextInput value={cfg.tagline} onChange={(e) => update("tagline", e.target.value)} />
        </Field>
        <ImageInput label="Логотип (PNG с прозрачным фоном)" value={cfg.logo} onChange={(v) => update("logo", v)} shopId={shopId} aspect="aspect-[3/1]" contain />
      </Group>
      <Group title="Готовые цветовые темы">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => update("theme", { ...t, preset: p.key, primary: p.primary, primary2: p.primary2, bg: p.bg, surface: p.surface, text: p.text, muted: p.muted })}
              className={cx("overflow-hidden rounded-xl border text-left transition", t.preset === p.key ? "border-gold gold-ring" : "border-white/10 hover:border-white/30")}
            >
              <div className="flex h-10" style={{ background: p.bg }}>
                <div className="m-1.5 flex-1 rounded-md" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.primary2})` }} />
                <div className="my-1.5 mr-1.5 w-4 rounded-md" style={{ background: p.surface }} />
              </div>
              <div className="bg-ink-900 px-2 py-1 text-[11px] font-semibold text-ink-200">{p.name}</div>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Цвета сайта">
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label="Акцент" value={t.primary} onChange={(v) => update("theme.primary", v)} />
          <ColorInput label="Акцент 2 (градиент)" value={t.primary2} onChange={(v) => update("theme.primary2", v)} />
          <ColorInput label="Фон" value={t.bg} onChange={(v) => update("theme.bg", v)} />
          <ColorInput label="Карточки" value={t.surface} onChange={(v) => update("theme.surface", v)} />
          <ColorInput label="Текст" value={t.text} onChange={(v) => update("theme.text", v)} />
          <ColorInput label="Второстепенный текст" value={t.muted} onChange={(v) => update("theme.muted", v)} />
        </div>
      </Group>
      <Group title="Шрифты">
        <Field label="Основной текст">
          <Select value={t.font} onChange={(v) => update("theme.font", v)} options={FONTS.map((f) => ({ value: f.key, label: f.name }))} />
        </Field>
        <Field label="Заголовки">
          <Select value={t.headingFont} onChange={(v) => update("theme.headingFont", v)} options={FONTS.map((f) => ({ value: f.key, label: f.name }))} />
        </Field>
        <div className="rounded-xl border border-white/10 bg-ink-900 p-3">
          <div style={{ fontFamily: fontVar(t.headingFont) }} className="text-xl font-bold">
            Заголовок магазина
          </div>
          <div style={{ fontFamily: fontVar(t.font) }} className="text-sm text-ink-300">
            Пример основного текста — Do'kon matni
          </div>
        </div>
      </Group>
      <Group title="Фон">
        <Segmented
          value={t.bgStyle}
          onChange={(v) => update("theme.bgStyle", v)}
          options={[
            { value: "solid", label: "Цвет" },
            { value: "gradient", label: "Градиент" },
            { value: "glow", label: "Свечение" },
            { value: "image", label: "Фото" },
          ]}
        />
        {t.bgStyle === "image" && <ImageInput label="Фоновое изображение" value={t.bgImage} onChange={(v) => update("theme.bgImage", v)} shopId={shopId} />}
      </Group>
      <Group title="Форма элементов">
        <Field label={`Скругление углов: ${t.radius}px`}>
          <input type="range" min={0} max={30} value={t.radius} onChange={(e) => update("theme.radius", Number(e.target.value))} className="w-full accent-[#F5A524]" />
        </Field>
        <Field label="Стиль карточек">
          <Segmented
            value={t.cardStyle}
            onChange={(v) => update("theme.cardStyle", v)}
            options={[
              { value: "glass", label: "Стекло" },
              { value: "solid", label: "Плотные" },
              { value: "outline", label: "Контур" },
            ]}
          />
        </Field>
      </Group>
    </>
  );
}

/* ================= Главная ================= */
function linkOptions(categories: Category[], products: Product[]) {
  return [
    { value: "", label: "Без ссылки" },
    { value: "/catalog", label: "Каталог" },
    ...categories.map((c) => ({ value: `/catalog/${c.slug}`, label: `Категория: ${c.name}` })),
    ...products.slice(0, 50).map((p) => ({ value: `/product/${p.id}`, label: `Товар: ${p.name}` })),
  ];
}

export function HomePanel({ cfg, update, shopId, categories, products, setPreview }: P) {
  const h = cfg.hero;
  return (
    <>
      <Group title="Главный экран" onOpen={() => setPreview("/")}>
        <Field label="Расположение">
          <Segmented value={h.layout} onChange={(v) => update("hero.layout", v)} options={[{ value: "split", label: "Картинка справа" }, { value: "center", label: "По центру" }]} />
        </Field>
        <Field label="Заголовок">
          <TextArea rows={2} value={h.title} onChange={(e) => update("hero.title", e.target.value)} className="min-h-0" />
        </Field>
        <Field label="Подзаголовок (теги)" hint="Например: UC • Аккаунты • Буст">
          <TextInput value={h.tags} onChange={(e) => update("hero.tags", e.target.value)} />
        </Field>
        <Field label="Описание">
          <TextInput value={h.subtitle} onChange={(e) => update("hero.subtitle", e.target.value)} />
        </Field>
        <Field label="Текст кнопки">
          <TextInput value={h.button} onChange={(e) => update("hero.button", e.target.value)} />
        </Field>
        <ImageInput label="Фото главной страницы" value={h.image} onChange={(v) => update("hero.image", v)} shopId={shopId} />
        {!h.image && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-300">Без фото — показываем иконку</span>
            <IconPicker value={h.art} onChange={(v) => update("hero.art", v)} />
          </div>
        )}
      </Group>
      <Group title={`Баннеры (${cfg.banners.length})`} onOpen={() => setPreview("/")}>
        {cfg.banners.map((b, i) => (
          <div key={b.id} className="space-y-2.5 rounded-xl border border-white/10 bg-ink-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-400">Баннер {i + 1}</span>
              <RowTools
                onUp={i > 0 ? () => update("banners", move(cfg.banners, i, -1)) : undefined}
                onDown={i < cfg.banners.length - 1 ? () => update("banners", move(cfg.banners, i, 1)) : undefined}
                onDelete={() => update("banners", cfg.banners.filter((x) => x.id !== b.id))}
              />
            </div>
            <ImageInput value={b.image} onChange={(v) => update(`banners.${i}.image`, v)} shopId={shopId} aspect="aspect-[2.2/1]" />
            <TextInput value={b.title} placeholder="Заголовок баннера" onChange={(e) => update(`banners.${i}.title`, e.target.value)} />
            <TextInput value={b.subtitle} placeholder="Подпись" onChange={(e) => update(`banners.${i}.subtitle`, e.target.value)} />
            <Select value={b.link} onChange={(v) => update(`banners.${i}.link`, v)} options={linkOptions(categories, products)} />
          </div>
        ))}
        <button
          type="button"
          disabled={cfg.banners.length >= 8}
          onClick={() => update("banners", [...cfg.banners, { id: uid(), image: null, title: "Новая акция", subtitle: "Скидки до −30%", link: "/catalog" }])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm font-semibold text-ink-300 hover:border-gold/60 hover:text-gold disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Добавить баннер
        </button>
      </Group>
      <Group title="Преимущества" defaultOpen={false} onOpen={() => setPreview("/")}>
        {cfg.features.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <IconPicker value={f.icon} onChange={(v) => update(`features.${i}.icon`, v)} />
            <TextInput value={f.text} onChange={(e) => update(`features.${i}.text`, e.target.value)} />
            <RowTools onDelete={() => update("features", cfg.features.filter((_, x) => x !== i))} />
          </div>
        ))}
        {cfg.features.length < 6 && (
          <button type="button" onClick={() => update("features", [...cfg.features, { icon: "Star", text: "Преимущество" }])} className="flex items-center gap-2 text-sm font-semibold text-gold">
            <Plus className="h-4 w-4" /> Добавить
          </button>
        )}
      </Group>
    </>
  );
}

/* ================= Блоки ================= */
const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Главный экран",
  categories: "Категории",
  popular: "Популярные товары",
  banners: "Баннеры",
  features: "Преимущества",
  new: "Новинки",
  about: "О магазине (кратко)",
  contacts: "Контакты (кратко)",
};

export function BlocksPanel({ cfg, update, setPreview }: P) {
  return (
    <Group title="Расположение блоков главной">
      <p className="text-xs text-ink-400">Меняйте порядок стрелками и скрывайте ненужные секции — предпросмотр обновится сразу.</p>
      <div className="space-y-2">
        {cfg.sections.map((s, i) => (
          <div key={s.id} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5", s.visible ? "border-white/10 bg-ink-900" : "border-white/5 bg-ink-900/40 opacity-60")}>
            <span className="w-5 text-center text-xs font-bold text-ink-500">{i + 1}</span>
            <button type="button" onClick={() => setPreview("/")} className="flex-1 text-left text-sm font-medium">
              {SECTION_LABELS[s.id]}
            </button>
            <button
              type="button"
              onClick={() => update(`sections.${i}.visible`, !s.visible)}
              className={cx("grid h-7 w-7 place-items-center rounded-lg", s.visible ? "bg-gold/15 text-gold" : "bg-white/5 text-ink-400")}
              aria-label={s.visible ? "Скрыть" : "Показать"}
            >
              {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <RowTools
              onUp={i > 0 ? () => update("sections", move(cfg.sections, i, -1)) : undefined}
              onDown={i < cfg.sections.length - 1 ? () => update("sections", move(cfg.sections, i, 1)) : undefined}
            />
          </div>
        ))}
      </div>
    </Group>
  );
}

/* ================= Страницы ================= */
export function PagesPanel({ cfg, update, shopId, setPreview, products }: P) {
  const pg = cfg.pages;
  const firstProduct = products[0]?.id;
  return (
    <>
      <Group title="Каталог и категории" defaultOpen={false} onOpen={() => setPreview("/catalog")}>
        <Field label="Заголовок каталога">
          <TextInput value={pg.catalog.title} onChange={(e) => update("pages.catalog.title", e.target.value)} />
        </Field>
        <Field label="Подзаголовок" hint="Названия, иконки и описания категорий меняются в разделе «Категории»">
          <TextInput value={pg.catalog.subtitle} onChange={(e) => update("pages.catalog.subtitle", e.target.value)} />
        </Field>
      </Group>
      <Group title="Страница товара" defaultOpen={false} onOpen={() => firstProduct && setPreview(`/product/${firstProduct}`)}>
        <Toggle label="Показывать характеристики" checked={pg.product.showSpecs} onChange={(v) => update("pages.product.showSpecs", v)} />
        <Toggle label="Показывать похожие товары" checked={pg.product.showSimilar} onChange={(v) => update("pages.product.showSimilar", v)} />
        <Field label="Заметка под кнопкой заказа" hint="Например: гарантия, сроки доставки">
          <TextInput value={pg.product.note} onChange={(e) => update("pages.product.note", e.target.value)} />
        </Field>
        <Field label="Текст кнопки заказа">
          <TextInput value={cfg.order.button} onChange={(e) => update("order.button", e.target.value)} />
        </Field>
        <Field label="Шаблон сообщения продавцу" hint="Переменные: {product} {price} {link} {shop}">
          <TextArea rows={4} value={cfg.order.message} onChange={(e) => update("order.message", e.target.value)} />
        </Field>
      </Group>
      <Group title="О магазине" defaultOpen={false} onOpen={() => setPreview("/about")}>
        <Field label="Заголовок">
          <TextInput value={pg.about.title} onChange={(e) => update("pages.about.title", e.target.value)} />
        </Field>
        <Field label="Текст">
          <TextArea rows={7} value={pg.about.text} onChange={(e) => update("pages.about.text", e.target.value)} />
        </Field>
        <ImageInput label="Фото" value={pg.about.image} onChange={(v) => update("pages.about.image", v)} shopId={shopId} />
      </Group>
      <Group title="Доставка" defaultOpen={false} onOpen={() => setPreview("/delivery")}>
        <Field label="Заголовок">
          <TextInput value={pg.delivery.title} onChange={(e) => update("pages.delivery.title", e.target.value)} />
        </Field>
        <Field label="Описание">
          <TextArea rows={2} value={pg.delivery.text} onChange={(e) => update("pages.delivery.text", e.target.value)} />
        </Field>
        {pg.delivery.items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-white/10 bg-ink-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <IconPicker value={it.icon} onChange={(v) => update(`pages.delivery.items.${i}.icon`, v)} />
              <RowTools
                onUp={i > 0 ? () => update("pages.delivery.items", move(pg.delivery.items, i, -1)) : undefined}
                onDelete={() => update("pages.delivery.items", pg.delivery.items.filter((_, x) => x !== i))}
              />
            </div>
            <TextInput value={it.title} placeholder="Заголовок" onChange={(e) => update(`pages.delivery.items.${i}.title`, e.target.value)} />
            <TextInput value={it.text} placeholder="Текст" onChange={(e) => update(`pages.delivery.items.${i}.text`, e.target.value)} />
          </div>
        ))}
        <button type="button" onClick={() => update("pages.delivery.items", [...pg.delivery.items, { icon: "Truck", title: "Новый пункт", text: "" }])} className="flex items-center gap-2 text-sm font-semibold text-gold">
          <Plus className="h-4 w-4" /> Добавить пункт
        </button>
      </Group>
      <Group title="Частые вопросы" defaultOpen={false} onOpen={() => setPreview("/faq")}>
        <Field label="Заголовок">
          <TextInput value={pg.faq.title} onChange={(e) => update("pages.faq.title", e.target.value)} />
        </Field>
        {pg.faq.items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-white/10 bg-ink-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-400">Вопрос {i + 1}</span>
              <RowTools
                onUp={i > 0 ? () => update("pages.faq.items", move(pg.faq.items, i, -1)) : undefined}
                onDelete={() => update("pages.faq.items", pg.faq.items.filter((_, x) => x !== i))}
              />
            </div>
            <TextInput value={it.q} placeholder="Вопрос" onChange={(e) => update(`pages.faq.items.${i}.q`, e.target.value)} />
            <TextArea rows={2} value={it.a} placeholder="Ответ" onChange={(e) => update(`pages.faq.items.${i}.a`, e.target.value)} className="min-h-0" />
          </div>
        ))}
        <button type="button" onClick={() => update("pages.faq.items", [...pg.faq.items, { q: "Новый вопрос?", a: "Ответ" }])} className="flex items-center gap-2 text-sm font-semibold text-gold">
          <Plus className="h-4 w-4" /> Добавить вопрос
        </button>
      </Group>
      <Group title="Контакты" defaultOpen={false} onOpen={() => setPreview("/contacts")}>
        <Field label="Заголовок">
          <TextInput value={pg.contacts.title} onChange={(e) => update("pages.contacts.title", e.target.value)} />
        </Field>
        <Field label="Подзаголовок">
          <TextInput value={pg.contacts.text} onChange={(e) => update("pages.contacts.text", e.target.value)} />
        </Field>
        <p className="text-xs text-ink-400">Телефон, адрес и соцсети — во вкладке «Магазин».</p>
      </Group>
    </>
  );
}

/* ================= Магазин (контакты, язык) ================= */
export function InfoPanel({ cfg, update, setPreview }: P) {
  const c = cfg.contacts;
  const s = cfg.social;
  return (
    <>
      <Group title="О бизнесе">
        <Field label="Описание бизнеса" hint="Показывается в подвале и в боте магазина">
          <TextArea rows={3} value={cfg.description} onChange={(e) => update("description", e.target.value)} />
        </Field>
        <Field label="Язык сайта">
          <Segmented value={cfg.language} onChange={(v) => update("language", v)} options={[{ value: "ru", label: "Русский" }, { value: "uz", label: "O'zbekcha" }]} />
        </Field>
        <Field label="Валюта">
          <Select value={cfg.currency} onChange={(v) => update("currency", v)} options={["сум", "so'm", "UZS", "$", "₽", "₸"].map((x) => ({ value: x, label: x }))} />
        </Field>
      </Group>
      <Group title="Контакты" onOpen={() => setPreview("/contacts")}>
        <Field label="Telegram продавца (для заказов)" hint="Сюда приходят покупатели после «Заказать в Telegram»">
          <TextInput value={c.telegram} placeholder="@username" onChange={(e) => update("contacts.telegram", e.target.value.replace(/^@/, ""))} />
        </Field>
        <Field label="Телефон">
          <TextInput value={c.phone} placeholder="+998 90 123 45 67" onChange={(e) => update("contacts.phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <TextInput value={c.email} onChange={(e) => update("contacts.email", e.target.value)} />
        </Field>
        <Field label="Адрес">
          <TextInput value={c.address} onChange={(e) => update("contacts.address", e.target.value)} />
        </Field>
        <Field label="Время работы">
          <TextInput value={c.hours} onChange={(e) => update("contacts.hours", e.target.value)} />
        </Field>
      </Group>
      <Group title="Социальные сети" defaultOpen={false} onOpen={() => setPreview("/contacts")}>
        {(
          [
            ["instagram", "Instagram"],
            ["telegramChannel", "Telegram-канал"],
            ["facebook", "Facebook"],
            ["youtube", "YouTube"],
            ["tiktok", "TikTok"],
            ["whatsapp", "WhatsApp (номер)"],
            ["website", "Сайт"],
          ] as const
        ).map(([k, label]) => (
          <Field key={k} label={label}>
            <TextInput value={s[k]} placeholder="username или ссылка" onChange={(e) => update(`social.${k}`, e.target.value)} />
          </Field>
        ))}
      </Group>
    </>
  );
}
