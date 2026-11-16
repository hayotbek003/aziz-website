export type Lang = "ru" | "uz";
export type SectionId = "hero" | "categories" | "popular" | "banners" | "features" | "new" | "about" | "contacts";

export interface Theme {
  preset: string;
  primary: string;
  primary2: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  radius: number;
  font: string;
  headingFont: string;
  bgStyle: "solid" | "gradient" | "glow" | "image";
  bgImage: string | null;
  cardStyle: "glass" | "solid" | "outline";
}

export interface Banner {
  id: string;
  image: string | null;
  title: string;
  subtitle: string;
  link: string; // "" | "/catalog" | "/catalog/<slug>" | "/product/<id>"
}

export interface InfoItem {
  icon: string;
  title: string;
  text: string;
}

export interface ShopConfig {
  name: string;
  logo: string | null;
  tagline: string;
  description: string;
  language: Lang;
  currency: string;
  theme: Theme;
  hero: {
    title: string;
    subtitle: string;
    tags: string;
    button: string;
    image: string | null;
    art: string;
    layout: "split" | "center";
  };
  banners: Banner[];
  sections: { id: SectionId; visible: boolean }[];
  features: { icon: string; text: string }[];
  pages: {
    catalog: { title: string; subtitle: string };
    product: { showSpecs: boolean; showSimilar: boolean; note: string };
    about: { title: string; text: string; image: string | null };
    delivery: { title: string; text: string; items: InfoItem[] };
    faq: { title: string; items: { q: string; a: string }[] };
    contacts: { title: string; text: string };
  };
  contacts: { telegram: string; phone: string; email: string; address: string; hours: string };
  social: {
    instagram: string;
    telegramChannel: string;
    facebook: string;
    youtube: string;
    tiktok: string;
    whatsapp: string;
    website: string;
  };
  order: { button: string; message: string };
  /** Страница-визитка для Instagram: /l/<slug> */
  links: {
    title: string;
    bio: string;
    showShop: boolean;
    showTelegram: boolean;
    showChannel: boolean;
    showBot: boolean;
    showInstagram: boolean;
    showPhone: boolean;
    items: { label: string; url: string }[];
  };
}

export interface Category {
  id: number | string;
  name: string;
  slug: string;
  icon: string;
  image: string | null;
  description: string;
  sort: number;
}

export interface Spec {
  k: string;
  v: string;
}

export interface Product {
  id: number | string;
  categoryId: number | string | null;
  name: string;
  price: number;
  oldPrice: number | null;
  priceFrom: boolean;
  description: string;
  specs: Spec[];
  images: string[];
  icon: string;
  isPopular: boolean;
  inStock: boolean;
  stockQty: number | null;
  sort: number;
  createdAt: string | null;
}

export interface StoreData {
  id: number | string;
  slug: string;
  template: string;
  config: ShopConfig;
  categories: Category[];
  products: Product[];
}

export interface ShopStatus {
  state: "trial" | "active" | "expired" | "unpaid" | "blocked";
  expires_at: string | null;
  days_left: number;
  is_live: boolean;
}

export interface ShopSummary {
  id: number;
  slug: string;
  name: string;
  template: string;
  url: string;
  logo: string | null;
  primary: string | null;
  status: ShopStatus;
  is_blocked: boolean;
  block_reason: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  has_unpublished: boolean;
  published_at: string | null;
  created_at: string | null;
  views: number;
  bot_username: string | null;
  owner?: { id: number; telegram_id: number; username: string | null; first_name: string | null };
}

export interface UserInfo {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  trial_used: boolean;
  created_at: string | null;
  shops?: number;
  last_seen_at?: string | null;
}

export interface Plan {
  months: number;
  price_uzs: number;
  stars: number;
  label: string;
}

export interface Payment {
  id: number;
  shop_id: number;
  months: number;
  amount: number;
  currency: string;
  method: string;
  status: "pending" | "paid" | "rejected";
  note: string;
  created_at: string | null;
  paid_at: string | null;
  shop_slug?: string | null;
  user?: string | null;
}

export interface TemplateMeta {
  key: string;
  name: string;
  emoji: string;
  icon: string;
  short: string;
  description: string;
  is_active?: boolean;
  sort?: number;
  primary?: string;
  primary2?: string;
  shops?: number;
}
