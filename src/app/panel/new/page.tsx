"use client";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Copy, Eye, Pencil, Rocket, Send, Store } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PreviewFrame } from "@/components/editor/PreviewFrame";
import { useAuth } from "@/components/panel/auth";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Field, Spinner, TextInput, useUi } from "@/components/panel/ui";
import Storefront from "@/components/store/Storefront";
import { api } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "@/lib/icons";
import { demoStore, slugifyLatin, TEMPLATES } from "@/lib/templates";
import type { ShopSummary, TemplateMeta } from "@/lib/types";

const PAGES = [
  { path: "/", label: "Главная" },
  { path: "/catalog", label: "Каталог" },
  { path: "/product/p0", label: "Товар" },
  { path: "/about", label: "О магазине" },
  { path: "/delivery", label: "Доставка" },
  { path: "/faq", label: "FAQ" },
  { path: "/contacts", label: "Контакты" },
];

function Wizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, config } = useAuth();
  const { toast } = useUi();
  const [templates, setTemplates] = useState<TemplateMeta[]>(TEMPLATES);
  const [key, setKey] = useState<string | null>(params.get("template"));
  const [step, setStep] = useState<"type" | "preview" | "form" | "done">(params.get("template") ? "preview" : "type");
  const [previewPath, setPreviewPath] = useState("/");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [seller, setSeller] = useState(user.username ? `@${user.username}` : "");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ShopSummary | null>(null);

  useEffect(() => {
    api<{ templates: TemplateMeta[] }>("/api/public/templates")
      .then((r) => r.templates.length && setTemplates(r.templates))
      .catch(() => {});
  }, []);

  const tpl = templates.find((t) => t.key === key) || null;
  const demo = useMemo(() => (key ? demoStore(key, name || undefined) : null), [key, name]);
  const idx = tpl ? templates.findIndex((t) => t.key === tpl.key) : 0;

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyLatin(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!slug) {
      setSlugState(null);
      return;
    }
    const h = setTimeout(() => {
      api<{ ok: boolean; reason?: string }>(`/api/me/slug-check?slug=${encodeURIComponent(slug)}`)
        .then(setSlugState)
        .catch(() => setSlugState(null));
    }, 350);
    return () => clearTimeout(h);
  }, [slug]);

  const create = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const r = await api<{ shop: ShopSummary }>("/api/me/shops", { body: { template: key, name, slug: slug || null, seller } });
      setCreated(r.shop);
      setStep("done");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (step === "type") {
    return (
      <PanelShell back="/panel" title="Создание сайта">
        <h2 className="mb-1 text-2xl font-black">Выберите тип сайта</h2>
        <p className="mb-5 text-sm text-ink-400">10 готовых шаблонов — каждый можно полностью изменить под себя.</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setKey(t.key);
                setPreviewPath("/");
                setStep("preview");
              }}
              className="panel-card group flex items-center gap-4 rounded-2xl p-4 text-left transition hover:border-gold/50"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `linear-gradient(135deg, ${t.primary}33, ${t.primary2}22)` }}>
                <Icon name={t.icon} className="h-6 w-6" style={{ color: t.primary }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t.name}</span>
                <span className="block truncate text-sm text-ink-400">{t.short}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-gold" />
            </button>
          ))}
        </div>
      </PanelShell>
    );
  }

  if (step === "preview" && tpl && demo) {
    const go = (d: number) => {
      const next = templates[(idx + d + templates.length) % templates.length];
      setKey(next.key);
      setPreviewPath("/");
    };
    return (
      <PanelShell back="/panel" title={`Шаблоны ${tpl.name}`} wide>
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="order-2 lg:order-1">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: `linear-gradient(135deg, ${tpl.primary}44, ${tpl.primary2}22)` }}>
                <Icon name={tpl.icon} className="h-6 w-6" style={{ color: tpl.primary }} />
              </span>
              <div>
                <h2 className="text-2xl font-black">{tpl.name}</h2>
                <p className="text-sm text-ink-400">{tpl.short}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-200">{tpl.description}</p>
            <div className="mt-5">
              <div className="label">Страницы шаблона — нажмите, чтобы посмотреть</div>
              <div className="flex flex-wrap gap-2">
                {PAGES.map((p) => (
                  <button
                    key={p.path}
                    type="button"
                    onClick={() => setPreviewPath(p.path)}
                    className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", previewPath === p.path ? "border-gold bg-gold/15 text-gold" : "border-white/10 text-ink-300 hover:text-ink-100")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="gold" size="lg" className="flex-1" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setStep("form")}>
                Выбрать этот шаблон
              </Button>
              <Link href={`/demo/${tpl.key}`} target="_blank" className="flex-1">
                <Button size="lg" className="w-full" icon={<Eye className="h-5 w-5" />}>
                  Открыть демо целиком
                </Button>
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep("type")}>
                Все шаблоны
              </Button>
              <div className="flex items-center gap-2 text-sm text-ink-400">
                <button type="button" onClick={() => go(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 hover:border-gold/50" aria-label="Предыдущий">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {idx + 1} / {templates.length}
                <button type="button" onClick={() => go(1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 hover:border-gold/50" aria-label="Следующий">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="order-1 mx-auto w-full max-w-[380px] lg:order-2">
            <div className="rounded-[2.4rem] border border-white/10 bg-black p-2.5 shadow-[0_30px_80px_-30px_rgba(245,165,36,0.35)]">
              <PreviewFrame width={390} className="h-[620px] rounded-[1.9rem] lg:h-[700px]">
                <Storefront data={demo} mode={{ kind: "embedded", path: previewPath, onNavigate: setPreviewPath }} />
              </PreviewFrame>
            </div>
          </div>
        </div>
      </PanelShell>
    );
  }

  if (step === "form" && tpl) {
    const canSubmit = name.trim().length >= 2 && (!slug || slugState?.ok !== false) && !busy;
    return (
      <PanelShell back="/panel" title="Создание сайта">
        <div className="mx-auto max-w-lg">
          <h2 className="text-2xl font-black">Заполните данные магазина</h2>
          <p className="mt-1 text-sm text-ink-400">
            Шаблон: {tpl.emoji} {tpl.name}.{" "}
            <button type="button" className="text-gold hover:underline" onClick={() => setStep("preview")}>
              Изменить
            </button>
          </p>
          <Card className="mt-5 space-y-4 p-5">
            <Field label="🏷 Название магазина">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="HAYOT Gaming" maxLength={80} autoFocus />
            </Field>
            <Field
              label="🔗 Ссылка (ID)"
              hint={slug ? `${config.webapp_url || location.origin}/shop/${slug}` : "Сгенерируем автоматически из названия"}
            >
              <TextInput
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder="hayotgaming"
                maxLength={40}
              />
              {slug && slugState && (
                <span className={cx("mt-1 block text-xs", slugState.ok ? "text-emerald-400" : "text-red-300")}>{slugState.ok ? "✓ Адрес свободен" : slugState.reason}</span>
              )}
            </Field>
            <Field label="💬 Ваш Telegram (для заказов)" hint="Покупатели будут писать сюда при нажатии «Заказать в Telegram»">
              <TextInput value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="@hayotbek_shop" />
            </Field>
          </Card>
          <div className={cx("mt-4 rounded-2xl border p-4 text-sm", user.trial_used ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-gold/30 bg-gold/10 text-ink-100")}>
            {user.trial_used
              ? "Бесплатный период уже использован на первом магазине. Новый магазин заработает после оплаты аренды."
              : `🎁 Первый магазин — ${config.trial_days} дней бесплатно. Сайт опубликуется сразу после создания.`}
          </div>
          <Button variant="gold" size="lg" className="mt-5 w-full" loading={busy} disabled={!canSubmit} onClick={create} icon={<Rocket className="h-5 w-5" />}>
            Создать сайт
          </Button>
        </div>
      </PanelShell>
    );
  }

  if (step === "done" && created) {
    const fullUrl = created.url;
    return (
      <PanelShell back="/panel" title="Готово">
        <div className="mx-auto flex max-w-md flex-col items-center pt-6 text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full border-4 border-emerald-400/80 shadow-[0_0_60px_-10px_rgba(52,211,153,0.6)]">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </div>
          <h2 className="mt-6 text-2xl font-black">Сайт успешно создан!</h2>
          <p className="mt-2 text-sm text-ink-300">
            {created.status.state === "trial" ? (
              <>
                Ваш магазин готов ✅ Бесплатный период: {config.trial_days} дней (до {formatDate(created.status.expires_at)})
              </>
            ) : (
              <>Магазин создан. Оплатите аренду, чтобы покупатели увидели сайт.</>
            )}
          </p>
          <Card className="mt-5 flex w-full items-center gap-2 p-3 text-left">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-gold">{fullUrl}</span>
            <Button
              size="sm"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={() => {
                navigator.clipboard?.writeText(fullUrl);
                toast("Ссылка скопирована");
              }}
            >
              Копировать
            </Button>
          </Card>
          <div className="mt-5 grid w-full gap-2">
            <a href={`/shop/${created.slug}`} target="_blank" rel="noopener">
              <Button variant="gold" size="lg" className="w-full" icon={<Store className="h-5 w-5" />}>
                Открыть сайт
              </Button>
            </a>
            <Button size="lg" icon={<Pencil className="h-5 w-5" />} onClick={() => router.push(`/panel/shop/${created.id}/editor`)}>
              Редактировать
            </Button>
            <Button size="lg" variant="ghost" icon={<Send className="h-5 w-5" />} onClick={() => router.push(`/panel/shop/${created.id}/billing`)}>
              Продлить аренду
            </Button>
          </div>
        </div>
      </PanelShell>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner className="text-gold" />
    </div>
  );
}

export default function NewShopPage() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}
