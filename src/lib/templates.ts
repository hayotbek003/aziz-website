import raw from "@shared/templates.json";
import type { Category, Plan, Product, ShopConfig, StoreData, TemplateMeta } from "./types";

type RawTemplate = {
  key: string;
  name: string;
  emoji: string;
  icon: string;
  short: string;
  description: string;
  config: Record<string, unknown>;
  categories: { name: string; icon: string }[];
  products: {
    name: string;
    price: number;
    oldPrice?: number;
    from?: boolean;
    cat: number;
    icon: string;
    popular?: boolean;
    desc?: string;
    specs?: string[][];
  }[];
};

const data = raw as unknown as {
  base: ShopConfig;
  templates: RawTemplate[];
  presets: { key: string; name: string; primary: string; primary2: string; bg: string; surface: string; text: string; muted: string }[];
  plans: Plan[];
};

export const PRESETS = data.presets;
export const DEFAULT_PLANS = data.plans;
export const BASE_CONFIG = data.base;

export function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) return structuredClone(base);
  const out: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const cur = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)) {
      out[k] = deepMerge(cur, v);
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out as T;
}

/** Дополняет конфиг значениями по умолчанию (на случай старых/неполных данных). */
export function normalizeConfig(cfg: Partial<ShopConfig> | null | undefined): ShopConfig {
  const merged = deepMerge(BASE_CONFIG, cfg || {});
  // гарантируем, что все секции присутствуют
  const ids = merged.sections.map((s) => s.id);
  for (const s of BASE_CONFIG.sections) if (!ids.includes(s.id)) merged.sections.push({ ...s, visible: false });
  return merged;
}

export const TEMPLATES: TemplateMeta[] = data.templates.map((t, i) => ({
  key: t.key,
  name: t.name,
  emoji: t.emoji,
  icon: t.icon,
  short: t.short,
  description: t.description,
  sort: i,
  primary: (t.config.theme as { primary: string }).primary,
  primary2: (t.config.theme as { primary2: string }).primary2,
}));

export function getTemplate(key: string) {
  return data.templates.find((t) => t.key === key);
}

export function slugifyLatin(text: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "",
    ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
  };
  return text
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

/** Демо-магазин шаблона — полностью работающая витрина без базы данных. */
export function demoStore(key: string, name?: string): StoreData | null {
  const t = getTemplate(key);
  if (!t) return null;
  const config = normalizeConfig(deepMerge(BASE_CONFIG, t.config));
  config.name = name || `AZIZ ${t.name}`;
  config.contacts = { ...config.contacts, telegram: "", phone: "+998 90 123 45 67", address: "Ташкент", hours: "Ежедневно 9:00–21:00" };
  config.social = { ...config.social, instagram: "aziz.website", telegramChannel: "aziz_website" };
  const categories: Category[] = t.categories.map((c, i) => ({
    id: `c${i}`,
    name: c.name,
    slug: slugifyLatin(c.name) || `cat-${i}`,
    icon: c.icon,
    image: null,
    description: "",
    sort: i,
  }));
  const products: Product[] = t.products.map((p, i) => ({
    id: `p${i}`,
    categoryId: categories[p.cat]?.id ?? null,
    name: p.name,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    priceFrom: !!p.from,
    description: p.desc || "",
    specs: (p.specs || []).map(([k, v]) => ({ k, v })),
    images: [],
    icon: p.icon,
    isPopular: !!p.popular,
    inStock: true,
    stockQty: null,
    sort: i,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  return { id: `demo-${key}`, slug: `demo-${key}`, template: key, config, categories, products };
}
