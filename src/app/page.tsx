"use client";
import { ArrowRight, Check, Eye, MousePointerClick, Palette, Rocket, Send, ShoppingBag, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LazyVisible, PreviewFrame } from "@/components/editor/PreviewFrame";
import { BrandMark } from "@/components/panel/Brand";
import Storefront from "@/components/store/Storefront";
import { Icon } from "@/lib/icons";
import { demoStore, TEMPLATES } from "@/lib/templates";
import type { TemplateMeta } from "@/lib/types";

function TemplateCard({ t, i }: { t: TemplateMeta; i: number }) {
  const demo = useMemo(() => demoStore(t.key, "AZIZ"), [t.key]);
  const router = useRouter();
  return (
    <div role="link" tabIndex={0} onClick={() => router.push(`/demo/${t.key}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/demo/${t.key}`)} className="group block cursor-pointer">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon name={t.icon} className="h-5 w-5" style={{ color: t.primary }} />
        <span className="font-brand text-sm font-bold">
          {String(i + 1).padStart(2, "0")}. {t.name}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black transition group-hover:border-gold/60 group-hover:shadow-[0_20px_60px_-20px_rgba(245,165,36,0.45)]">
        <LazyVisible className="h-[340px]">
          {demo && (
            <PreviewFrame width={390} className="h-[340px]" interactive={false}>
              <Storefront data={demo} mode={{ kind: "embedded", path: "/", onNavigate: () => {} }} />
            </PreviewFrame>
          )}
        </LazyVisible>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-3 pt-10">
          <span className="text-xs text-ink-300">{t.short}</span>
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold backdrop-blur group-hover:bg-gold group-hover:text-black">
            <Eye className="h-3.5 w-3.5" /> Демо
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [bot, setBot] = useState("");
  useEffect(() => {
    fetch("/api/public/config")
      .then((r) => r.json())
      .then((c) => setBot(c.bot_username || ""))
      .catch(() => {});
  }, []);
  const botUrl = bot ? `https://t.me/${bot}` : "/panel";

  return (
    <div className="overflow-x-hidden">
      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark size={30} />
            <span className="font-brand text-sm font-black">
              <span className="gold-text">AZIZ</span> WEBSITE
            </span>
          </Link>
          <nav className="ml-6 hidden gap-6 text-sm text-ink-300 md:flex">
            <a href="#templates" className="hover:text-white">Шаблоны</a>
            <a href="#how" className="hover:text-white">Как это работает</a>
            <a href="#features" className="hover:text-white">Возможности</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/panel" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink-200 hover:bg-white/5 sm:block">
              Кабинет
            </Link>
            <a href={botUrl} target={bot ? "_blank" : undefined} rel="noopener" className="gold-btn flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold">
              <Send className="h-4 w-4" /> Открыть бота
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_15%_0%,rgba(245,165,36,0.18),transparent_60%),radial-gradient(700px_400px_at_100%_30%,rgba(245,165,36,0.08),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <div className="flex items-center gap-4">
              <BrandMark size={84} className="drop-shadow-[0_0_30px_rgba(245,165,36,0.45)]" />
              <h1 className="font-brand text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
                <span className="text-white">AZIZ</span>
                <br />
                <span className="gold-text">WEBSITE</span>
              </h1>
            </div>
            <p className="mt-6 max-w-xl text-2xl font-semibold leading-snug text-ink-100 sm:text-3xl">Платформа для создания интернет-магазинов в Telegram</p>
            <div className="mt-6 inline-block rounded-2xl border border-gold/60 p-5 text-lg font-semibold leading-relaxed shadow-[0_0_50px_-20px_rgba(245,165,36,0.8)] sm:text-xl">
              <div>
                <span className="text-gold">10</span> готовых шаблонов
              </div>
              <div>
                <span className="text-gold">+</span> управление через бота
              </div>
              <div>
                <span className="text-gold">+ 7</span> дней бесплатно
              </div>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={botUrl} target={bot ? "_blank" : undefined} rel="noopener" className="gold-btn flex items-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold">
                <Rocket className="h-5 w-5" /> Создать магазин
              </a>
              <a href="#templates" className="flex items-center gap-2 rounded-2xl border border-white/15 px-6 py-3.5 text-base font-semibold hover:border-gold/50">
                Смотреть шаблоны <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-ink-300">
              <span className="flex items-center gap-2">
                <Send className="h-5 w-5 text-gold" /> Telegram Web App
              </span>
              <span className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-gold" /> Быстрый запуск
              </span>
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-gold" /> Заказы в личный Telegram
              </span>
            </div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-[380px] sm:block">
            <div className="absolute -inset-10 rounded-full bg-gold/10 blur-3xl" />
            <div className="relative rounded-[2.6rem] border border-white/10 bg-black p-2.5 shadow-[0_40px_120px_-40px_rgba(245,165,36,0.5)]">
              <HeroPhone />
            </div>
          </div>
        </div>
      </section>

      {/* Шаблоны */}
      <section id="templates" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-block rounded-xl border border-gold/50 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">10 типов шаблонов</div>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Готовые магазины под любой бизнес</h2>
            <p className="mt-2 max-w-2xl text-ink-300">Каждый шаблон — полноценный адаптивный сайт: главная, каталог, категории, товар, о магазине, доставка, FAQ, контакты и избранное.</p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TEMPLATES.map((t, i) => (
            <TemplateCard key={t.key} t={t} i={i} />
          ))}
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14">
        <h2 className="text-3xl font-black sm:text-4xl">Как это работает</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Send, t: "Нажмите START", d: "Откройте бота и нажмите «Создать сайт»." },
            { icon: MousePointerClick, t: "Выберите шаблон", d: "Посмотрите демо всех страниц и выберите дизайн." },
            { icon: Palette, t: "Настройте под себя", d: "Логотип, цвета, шрифты, баннеры, товары и цены." },
            { icon: Rocket, t: "Публикуйте", d: "Сайт сразу доступен по ссылке — 7 дней бесплатно." },
          ].map((s, i) => (
            <div key={s.t} className="panel-card relative rounded-2xl p-5">
              <span className="absolute right-4 top-3 font-brand text-4xl font-black text-white/5">{i + 1}</span>
              <s.icon className="h-7 w-7 text-gold" />
              <div className="mt-3 text-lg font-bold">{s.t}</div>
              <p className="mt-1 text-sm text-ink-300">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14">
        <div className="panel-card grid gap-8 rounded-3xl p-6 sm:p-10 lg:grid-cols-2">
          <div>
            <div className="inline-block rounded-xl border border-gold/50 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">Возможности системы</div>
            <h2 className="mt-3 text-3xl font-black">Всё, что нужно для продаж в Telegram</h2>
            <p className="mt-3 text-ink-300">
              Покупатель выбирает товар и нажимает «Заказать в Telegram» — открывается ваш чат с готовым сообщением о товаре. Никаких сложных корзин и
              комиссий.
            </p>
            <a href={botUrl} target={bot ? "_blank" : undefined} rel="noopener" className="gold-btn mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-bold">
              <Sparkles className="h-5 w-5" /> Начать бесплатно
            </a>
          </div>
          <ul className="grid gap-3 text-[15px]">
            {[
              "Создание магазина через Telegram",
              "10 готовых дизайнов",
              "Визуальный редактор: логотип, цвета, шрифты, баннеры, блоки",
              "Добавление и управление товарами и категориями",
              "Заказы в личный Telegram продавца",
              "Русский и узбекский язык сайта",
              "7 дней бесплатно (первый магазин), далее — платная аренда",
              "Единый хостинг на Vercel — без покупки домена",
              "Работа через Telegram Web App",
            ].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-gold text-black">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-sm text-ink-500">
        © {new Date().getFullYear()} AZIZ Website · <Link href="/panel" className="hover:text-gold">Личный кабинет</Link>
      </footer>
    </div>
  );
}

function HeroPhone() {
  const demo = useMemo(() => demoStore("gaming", "HAYOT Gaming"), []);
  const [path, setPath] = useState("/");
  if (!demo) return null;
  return (
    <PreviewFrame width={390} className="h-[640px] rounded-[2rem]">
      <Storefront data={demo} mode={{ kind: "embedded", path, onNavigate: setPath }} />
    </PreviewFrame>
  );
}
