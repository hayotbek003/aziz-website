"use client";
import { CalendarClock, CreditCard, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Field, Modal, Spinner, StatusBadge, TextArea, useUi } from "@/components/panel/ui";
import { api } from "@/lib/api";
import { cx, formatDate, formatNumber } from "@/lib/format";
import { tg } from "@/lib/telegram";
import type { Payment, Plan, ShopStatus } from "@/lib/types";

type Billing = {
  status: ShopStatus;
  trial_ends_at: string | null;
  paid_until: string | null;
  plans: Plan[];
  payments: Payment[];
  manual_info: string;
  stars_available: boolean;
};

const PAY_STATUS: Record<Payment["status"], string> = { pending: "На проверке", paid: "Оплачено", rejected: "Отклонено" };

export default function BillingPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useUi();
  const [b, setB] = useState<Billing | null>(null);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => api<Billing>(`/api/me/shops/${id}/billing`).then(setB).catch((e) => toast(e.message, "err")), [id, toast]);
  useEffect(() => {
    load();
  }, [load]);

  const payStars = async () => {
    setBusy("stars");
    try {
      const r = await api<{ invoice_link: string }>(`/api/me/shops/${id}/billing/stars`, { body: { months } });
      const w = tg();
      if (w?.openInvoice) {
        w.openInvoice(r.invoice_link, (status) => {
          if (status === "paid") {
            toast("Оплата прошла! Срок продлён");
            setTimeout(load, 1500);
          } else if (status === "failed") toast("Оплата не прошла", "err");
        });
      } else {
        window.open(r.invoice_link, "_blank", "noopener");
        toast("Счёт открыт в Telegram");
      }
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const payManual = async () => {
    setBusy("manual");
    try {
      await api(`/api/me/shops/${id}/billing/manual`, { body: { months, note } });
      setManual(false);
      setNote("");
      toast("Заявка отправлена администратору");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  if (!b) return <PanelShell back={`/panel/shop/${id}`} title="Аренда"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;
  const plan = b.plans.find((p) => p.months === months) || b.plans[0];
  return (
    <PanelShell back={`/panel/shop/${id}`} title="Срок аренды">
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold/10 text-gold">
            <CalendarClock className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <StatusBadge status={b.status} />
            <div className="mt-1 text-lg font-bold">{b.status.expires_at ? `Работает до ${formatDate(b.status.expires_at)}` : "Срок не активирован"}</div>
            <div className="text-xs text-ink-400">
              Пробный период: {b.trial_ends_at ? `до ${formatDate(b.trial_ends_at)}` : "не применялся"} · Оплачено: {b.paid_until ? `до ${formatDate(b.paid_until)}` : "—"}
            </div>
          </div>
        </Card>
        <p className="text-sm text-ink-400">Сроки контролирует сервер: по окончании аренды сайт автоматически скрывается от покупателей, а после оплаты — сразу включается.</p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {b.plans.map((p) => (
            <button
              key={p.months}
              type="button"
              onClick={() => setMonths(p.months)}
              className={cx("panel-card rounded-2xl p-4 text-left transition", months === p.months ? "gold-ring" : "hover:border-white/20")}
            >
              <div className="text-sm font-semibold text-ink-300">{p.label}</div>
              <div className="mt-1 text-lg font-black">{formatNumber(p.price_uzs)} сум</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-gold">
                <Star className="h-3 w-3" fill="currentColor" /> {p.stars} Stars
              </div>
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="gold" size="lg" loading={busy === "stars"} disabled={!b.stars_available || b.status.state === "blocked"} onClick={payStars} icon={<Star className="h-5 w-5" />}>
            Оплатить {plan?.stars} ⭐ Stars
          </Button>
          <Button size="lg" onClick={() => setManual(true)} disabled={b.status.state === "blocked"} icon={<CreditCard className="h-5 w-5" />}>
            Оплатить переводом
          </Button>
        </div>
        {!b.stars_available && <p className="text-xs text-amber-300">Оплата Stars станет доступна после настройки бота (BOT_TOKEN).</p>}

        <Card className="p-5">
          <h3 className="mb-3 font-bold">История платежей</h3>
          {b.payments.length === 0 ? (
            <p className="text-sm text-ink-500">Платежей пока нет</p>
          ) : (
            b.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 text-sm last:border-0">
                <div>
                  <div className="font-semibold">
                    #{p.id} · {p.months} мес.
                  </div>
                  <div className="text-xs text-ink-400">
                    {formatDate(p.created_at)} · {p.method === "stars" ? "Telegram Stars" : p.method === "admin" ? "Администратор" : "Перевод"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {formatNumber(p.amount)} {p.currency === "XTR" ? "⭐" : "сум"}
                  </div>
                  <div className={cx("text-xs", p.status === "paid" ? "text-emerald-400" : p.status === "pending" ? "text-amber-300" : "text-red-300")}>{PAY_STATUS[p.status]}</div>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <Modal
        open={manual}
        onClose={() => setManual(false)}
        title={`Оплата переводом — ${plan?.label}`}
        footer={
          <>
            <Button className="flex-1" onClick={() => setManual(false)}>
              Отмена
            </Button>
            <Button className="flex-1" variant="gold" loading={busy === "manual"} onClick={payManual}>
              Я оплатил(а)
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
            <div className="text-2xl font-black">{formatNumber(plan?.price_uzs || 0)} сум</div>
            <p className="mt-2 whitespace-pre-line text-ink-200">{b.manual_info}</p>
          </div>
          <Field label="Комментарий (номер чека, время перевода)">
            <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-400">Администратор проверит платёж и продлит срок. Вы получите уведомление в Telegram.</p>
        </div>
      </Modal>
    </PanelShell>
  );
}
