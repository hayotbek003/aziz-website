"use client";
import { Ban, Check, CheckCircle2, CreditCard, ExternalLink, LayoutDashboard, LayoutTemplate, Plus, RefreshCw, Search, Store, Tags, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/panel/auth";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Select, Spinner, StatusBadge, TextInput, Toggle, useUi } from "@/components/panel/ui";
import { api } from "@/lib/api";
import { cx, formatDate, formatNumber } from "@/lib/format";
import { Icon } from "@/lib/icons";
import type { Payment, Plan, ShopSummary, TemplateMeta, UserInfo } from "@/lib/types";

const TABS = [
  { key: "overview", label: "Обзор", icon: LayoutDashboard },
  { key: "shops", label: "Магазины", icon: Store },
  { key: "users", label: "Пользователи", icon: Users },
  { key: "payments", label: "Платежи", icon: CreditCard },
  { key: "templates", label: "Шаблоны", icon: LayoutTemplate },
  { key: "plans", label: "Тарифы", icon: Tags },
] as const;
type Tab = (typeof TABS)[number]["key"];

function Overview() {
  const [o, setO] = useState<{ users: number; shops: number; products: number; states: Record<string, number>; revenue: Record<string, number>; pending_payments: number; by_template: Record<string, number> } | null>(null);
  const { toast } = useUi();
  useEffect(() => {
    api<typeof o>("/api/admin/overview").then(setO).catch((e) => toast(e.message, "err"));
  }, [toast]);
  if (!o) return <Loading />;
  const tiles = [
    { l: "Пользователи", v: o.users },
    { l: "Магазины", v: o.shops },
    { l: "Товары", v: o.products },
    { l: "Заявки на оплату", v: o.pending_payments },
    { l: "Пробный период", v: o.states.trial || 0 },
    { l: "Оплачены", v: o.states.active || 0 },
    { l: "Истёк срок / не оплачены", v: (o.states.expired || 0) + (o.states.unpaid || 0) },
    { l: "Заблокированы", v: o.states.blocked || 0 },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.l} className="p-4">
            <div className="text-2xl font-black">{formatNumber(t.v)}</div>
            <div className="text-xs text-ink-400">{t.l}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">Выручка (подтверждённые платежи)</h3>
          <div className="text-xl font-black text-gold">{formatNumber(o.revenue.UZS || 0)} сум</div>
          <div className="text-sm text-ink-300">{formatNumber(o.revenue.XTR || 0)} ⭐ Telegram Stars</div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">Магазины по шаблонам</h3>
          <div className="space-y-1 text-sm">
            {Object.entries(o.by_template).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="capitalize text-ink-300">{k}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </div>
            ))}
            {!Object.keys(o.by_template).length && <p className="text-ink-500">Пока нет магазинов</p>}
          </div>
        </Card>
      </div>
      <BotSetup />
    </div>
  );
}

function BotSetup() {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/bot/setup", { body: {} });
      toast(r.ok ? `Бот настроен: ${String(r.webhook ?? "")}` : String(r.error), r.ok ? "ok" : "err");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <h3 className="text-sm font-bold">Telegram-бот платформы</h3>
        <p className="text-xs text-ink-400">Регистрирует webhook, команды и кнопку меню Web App (нужен HTTPS-домен).</p>
      </div>
      <Button loading={busy} onClick={run} icon={<RefreshCw className="h-4 w-4" />}>
        Настроить бота
      </Button>
    </Card>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-20">
      <Spinner className="text-gold" />
    </div>
  );
}

function Shops() {
  const { toast, confirm } = useUi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [list, setList] = useState<ShopSummary[] | null>(null);
  const load = useCallback(() => {
    api<{ shops: ShopSummary[] }>(`/api/admin/shops?q=${encodeURIComponent(q)}&status=${status}`).then((r) => setList(r.shops)).catch((e) => toast(e.message, "err"));
  }, [q, status, toast]);
  useEffect(() => {
    const h = setTimeout(load, 250);
    return () => clearTimeout(h);
  }, [load]);

  const replace = (s: ShopSummary) => setList((l) => l?.map((x) => (x.id === s.id ? { ...x, ...s, owner: x.owner } : x)) || null);
  const block = async (s: ShopSummary) => {
    const blocked = !s.is_blocked;
    let reason = "";
    if (blocked) {
      if (!(await confirm(`Заблокировать магазин «${s.name}»? Сайт станет недоступен покупателям.`, { danger: true, ok: "Заблокировать" }))) return;
      reason = window.prompt("Причина блокировки (необязательно)") || "";
    }
    try {
      const r = await api<{ shop: ShopSummary }>(`/api/admin/shops/${s.id}/block`, { body: { blocked, reason } });
      replace(r.shop);
      toast(blocked ? "Магазин заблокирован" : "Магазин активирован");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const extend = async (s: ShopSummary, days: number) => {
    try {
      const r = await api<{ shop: ShopSummary }>(`/api/admin/shops/${s.id}/extend`, { body: { days } });
      replace(r.shop);
      toast(`Срок изменён: до ${formatDate(r.shop.status.expires_at)}`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div>
      <div className="mb-3 flex justify-end"><Link href="/admin/subscriptions"><Button variant="gold">Ручное управление подписками</Button></Link></div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Адрес, название, @владелец" className="pl-9" />
        </div>
        <Select
          value={status}
          onChange={setStatus}
          className="w-48"
          options={[
            { value: "", label: "Все статусы" },
            { value: "trial", label: "Пробный период" },
            { value: "active", label: "Оплачены" },
            { value: "expired", label: "Срок истёк" },
            { value: "unpaid", label: "Ожидают оплаты" },
            { value: "blocked", label: "Заблокированы" },
          ]}
        />
      </div>
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-500">Магазинов не найдено</p>
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold">{s.name}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-xs text-ink-400">
                    #{s.id} · /shop/{s.slug} · {s.template} · владелец {s.owner?.username ? `@${s.owner.username}` : s.owner?.first_name} ({s.owner?.telegram_id})
                  </div>
                  <div className="text-xs text-ink-400">
                    Создан {formatDate(s.created_at)} · пробный до {formatDate(s.trial_ends_at)} · оплачен до {formatDate(s.paid_until)} · просмотров {s.views}
                  </div>
                  {s.block_reason && <div className="text-xs text-red-300">Причина: {s.block_reason}</div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={`/shop/${s.slug}`} target="_blank" rel="noopener">
                    <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                      Сайт
                    </Button>
                  </a>
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => extend(s, 7)}>
                    7 дн.
                  </Button>
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => extend(s, 30)}>
                    30 дн.
                  </Button>
                  <Button size="sm" variant={s.is_blocked ? "gold" : "danger"} icon={s.is_blocked ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />} onClick={() => block(s)}>
                    {s.is_blocked ? "Активировать" : "Блок"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const { toast, confirm } = useUi();
  const [q, setQ] = useState("");
  const [list, setList] = useState<UserInfo[] | null>(null);
  useEffect(() => {
    const h = setTimeout(() => api<{ users: UserInfo[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`).then((r) => setList(r.users)).catch((e) => toast(e.message, "err")), 250);
    return () => clearTimeout(h);
  }, [q, toast]);
  const block = async (u: UserInfo) => {
    if (!u.is_blocked && !(await confirm(`Заблокировать пользователя ${u.username ? "@" + u.username : u.first_name}? Он не сможет войти в кабинет.`, { danger: true, ok: "Заблокировать" }))) return;
    try {
      const r = await api<{ user: UserInfo }>(`/api/admin/users/${u.id}/block`, { body: { blocked: !u.is_blocked } });
      setList((l) => l?.map((x) => (x.id === u.id ? { ...x, ...r.user } : x)) || null);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="@username, имя или Telegram ID" className="pl-9" />
      </div>
      {!list ? (
        <Loading />
      ) : (
        <Card className="divide-y divide-white/5">
          {list.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/10 text-sm font-bold text-gold">{(u.first_name || u.username || "?").charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {u.first_name} {u.username && <span className="text-ink-400">@{u.username}</span>} {u.is_admin && <span className="text-xs text-gold">admin</span>}
                </div>
                <div className="text-xs text-ink-400">
                  ID {u.telegram_id} · магазинов: {u.shops} · с {formatDate(u.created_at)} · пробный {u.trial_used ? "использован" : "доступен"}
                </div>
              </div>
              <Button size="sm" variant={u.is_blocked ? "gold" : "danger"} onClick={() => block(u)}>
                {u.is_blocked ? "Разблокировать" : "Блок"}
              </Button>
            </div>
          ))}
          {list.length === 0 && <p className="p-6 text-center text-sm text-ink-500">Никого не найдено</p>}
        </Card>
      )}
    </div>
  );
}

function Payments() {
  const { toast, confirm } = useUi();
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState<Payment[] | null>(null);
  const load = useCallback(() => {
    setList(null);
    api<{ payments: Payment[] }>(`/api/admin/payments?status=${status}`).then((r) => setList(r.payments)).catch((e) => toast(e.message, "err"));
  }, [status, toast]);
  useEffect(load, [load]);
  const act = async (p: Payment, action: "confirm" | "reject") => {
    if (!(await confirm(action === "confirm" ? `Подтвердить оплату #${p.id} и продлить магазин на ${p.months} мес.?` : `Отклонить заявку #${p.id}?`, { danger: action === "reject" }))) return;
    try {
      await api(`/api/admin/payments/${p.id}/${action}`, { body: {} });
      toast(action === "confirm" ? "Оплата подтверждена, срок продлён" : "Заявка отклонена");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div>
      <div className="mb-3 w-56">
        <Select value={status} onChange={setStatus} options={[{ value: "pending", label: "На проверке" }, { value: "paid", label: "Оплачены" }, { value: "rejected", label: "Отклонены" }, { value: "", label: "Все" }]} />
      </div>
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-500">Платежей нет</p>
      ) : (
        <Card className="divide-y divide-white/5">
          {list.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  #{p.id} · /shop/{p.shop_slug} · {p.months} мес. · {formatNumber(p.amount)} {p.currency === "XTR" ? "⭐" : "сум"}
                </div>
                <div className="text-xs text-ink-400">
                  {p.user ? `@${p.user}` : ""} · {p.method === "stars" ? "Telegram Stars" : "Перевод"} · {formatDate(p.created_at)} {p.note && `· «${p.note}»`}
                </div>
              </div>
              {p.status === "pending" && p.method !== "stars" ? (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="gold" icon={<Check className="h-3.5 w-3.5" />} onClick={() => act(p, "confirm")}>
                    Подтвердить
                  </Button>
                  <Button size="sm" variant="danger" icon={<X className="h-3.5 w-3.5" />} onClick={() => act(p, "reject")}>
                    Отклонить
                  </Button>
                </div>
              ) : (
                <span className={cx("text-xs font-semibold", p.status === "paid" ? "text-emerald-400" : p.status === "pending" ? "text-amber-300" : "text-red-300")}>
                  {p.status === "paid" ? "Оплачено" : p.status === "pending" ? "Ожидает Stars" : "Отклонено"}
                </span>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Templates() {
  const { toast } = useUi();
  const [list, setList] = useState<TemplateMeta[] | null>(null);
  useEffect(() => {
    api<{ templates: TemplateMeta[] }>("/api/admin/templates").then((r) => setList(r.templates)).catch((e) => toast(e.message, "err"));
  }, [toast]);
  const save = async (t: TemplateMeta) => {
    try {
      await api(`/api/admin/templates/${t.key}`, { method: "PUT", body: { is_active: t.is_active, sort: t.sort, name: t.name, description: t.description } });
      toast(`Шаблон ${t.name} сохранён`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const set = (key: string, patch: Partial<TemplateMeta>) => setList((l) => l?.map((t) => (t.key === key ? { ...t, ...patch } : t)) || null);
  if (!list) return <Loading />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((t) => (
        <Card key={t.key} className={cx("space-y-3 p-4", !t.is_active && "opacity-60")}>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${t.primary}33` }}>
              <Icon name={t.icon} className="h-5 w-5" style={{ color: t.primary }} />
            </span>
            <div className="flex-1">
              <div className="font-bold">{t.key}</div>
              <div className="text-xs text-ink-400">Магазинов: {t.shops}</div>
            </div>
            <Link href={`/demo/${t.key}`} target="_blank" className="text-xs text-gold hover:underline">
              Демо
            </Link>
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <TextInput value={t.name} onChange={(e) => set(t.key, { name: e.target.value })} placeholder="Название" />
            <TextInput type="number" value={t.sort} onChange={(e) => set(t.key, { sort: Number(e.target.value) })} title="Порядок" />
          </div>
          <TextInput value={t.description} onChange={(e) => set(t.key, { description: e.target.value })} placeholder="Описание" />
          <Toggle label="Доступен для новых магазинов" checked={!!t.is_active} onChange={(v) => set(t.key, { is_active: v })} />
          <Button size="sm" variant="gold" className="w-full" onClick={() => save(t)}>
            Сохранить
          </Button>
        </Card>
      ))}
    </div>
  );
}

function Plans() {
  const { toast } = useUi();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    api<{ plans: Plan[] }>("/api/admin/plans").then((r) => setPlans(r.plans)).catch((e) => toast(e.message, "err"));
  }, [toast]);
  if (!plans) return <Loading />;
  const set = (i: number, patch: Partial<Plan>) => setPlans(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const save = async () => {
    try {
      const r = await api<{ plans: Plan[] }>("/api/admin/plans", { method: "PUT", body: { plans } });
      setPlans(r.plans);
      toast("Тарифы сохранены");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-ink-400">Первый магазин каждого пользователя — бесплатно на пробный период (TRIAL_DAYS). Далее — платная аренда по этим тарифам.</p>
      {plans.map((p, i) => (
        <Card key={i} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_90px_130px_110px_40px]">
          <TextInput value={p.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Название" />
          <TextInput type="number" value={p.months} onChange={(e) => set(i, { months: Number(e.target.value) })} title="Месяцев" />
          <TextInput type="number" value={p.price_uzs} onChange={(e) => set(i, { price_uzs: Number(e.target.value) })} title="Цена, сум" />
          <TextInput type="number" value={p.stars} onChange={(e) => set(i, { stars: Number(e.target.value) })} title="Stars" />
          <button type="button" onClick={() => setPlans(plans.filter((_, j) => j !== i))} className="grid place-items-center rounded-xl bg-red-500/10 text-red-300" aria-label="Удалить">
            <X className="h-4 w-4" />
          </button>
        </Card>
      ))}
      <div className="flex gap-2">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setPlans([...plans, { months: 1, price_uzs: 99000, stars: 250, label: "Новый тариф" }])}>
          Добавить
        </Button>
        <Button variant="gold" onClick={save}>
          Сохранить тарифы
        </Button>
      </div>
      <p className="text-xs text-ink-500">Колонки: название · месяцев · цена в сумах · цена в Telegram Stars</p>
    </div>
  );
}

function Admin() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <PanelShell title="Админ-панель AZIZ" back="/panel" wide>
      <nav className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cx("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold", tab === t.key ? "bg-gold text-black" : "panel-card text-ink-300 hover:text-ink-100")}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && <Overview />}
      {tab === "shops" && <Shops />}
      {tab === "users" && <UsersTab />}
      {tab === "payments" && <Payments />}
      {tab === "templates" && <Templates />}
      {tab === "plans" && <Plans />}
    </PanelShell>
  );
}

export default function AdminPage() {
  return (
    <AuthGate requireAdmin>
      <Admin />
    </AuthGate>
  );
}
