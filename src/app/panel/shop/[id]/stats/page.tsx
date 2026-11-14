"use client";
import { Table2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Card, Segmented, Spinner } from "@/components/panel/ui";
import { api } from "@/lib/api";
import { cx, formatNumber } from "@/lib/format";

type Day = { date: string; view: number; product_view: number; order_click: number };
type Stats = {
  days: Day[];
  totals: { view: number; product_view: number; order_click: number };
  all_time_views: number;
  products: number;
  top_viewed: { id: number; name: string; count: number }[];
  top_ordered: { id: number; name: string; count: number }[];
};

function shortDate(d: string) {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}`;
}

/** Одна серия = один цвет (золото), без легенды; tooltip при наведении/тапе; табличный вид. */
function BarChart({ title, days, field }: { title: string; days: Day[]; field: "view" | "order_click" | "product_view" }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d[field]));
  const nice = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const h = 160;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <button type="button" onClick={() => setTable(!table)} className={cx("flex items-center gap-1 rounded-lg px-2 py-1 text-xs", table ? "bg-gold/15 text-gold" : "text-ink-400 hover:text-ink-100")}>
          <Table2 className="h-3.5 w-3.5" /> Таблица
        </button>
      </div>
      {table ? (
        <div className="max-h-56 overflow-y-auto text-sm">
          {days.map((d) => (
            <div key={d.date} className="flex justify-between border-b border-white/5 py-1.5">
              <span className="text-ink-400">{shortDate(d.date)}</span>
              <span className="font-semibold tabular-nums">{d[field]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between text-[10px] text-ink-500" style={{ height: h }}>
            {[nice, nice / 2, 0].map((v) => (
              <div key={v} className="flex items-center gap-2">
                <span className="w-6 text-right tabular-nums">{v}</span>
                <span className="h-px flex-1 bg-white/5" />
              </div>
            ))}
          </div>
          <div className="relative ml-8 flex items-end gap-[2px]" style={{ height: h }} onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                className="group relative flex h-full flex-1 items-end"
                aria-label={`${shortDate(d.date)}: ${d[field]}`}
              >
                <span
                  className={cx("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-gold-300" : "bg-gold")}
                  style={{ height: `${(d[field] / nice) * 100}%`, minHeight: d[field] ? 2 : 0 }}
                />
              </button>
            ))}
            {hover !== null && days[hover] && (
              <div
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs shadow-xl"
                style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
              >
                <div className="text-ink-400">{shortDate(days[hover].date)}</div>
                <div className="font-bold tabular-nums text-ink-100">{days[hover][field]}</div>
              </div>
            )}
          </div>
          <div className="ml-8 mt-1.5 flex justify-between text-[10px] text-ink-500">
            <span>{shortDate(days[0]?.date || "")}</span>
            <span>{shortDate(days[days.length - 1]?.date || "")}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function TopList({ title, items }: { title: string; items: { id: number; name: string; count: number }[] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-500">Пока нет данных</p>
      ) : (
        items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0">
            <span className="w-4 text-xs font-bold text-ink-500">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
            <span className="text-sm font-semibold tabular-nums">{it.count}</span>
          </div>
        ))
      )}
    </Card>
  );
}

export default function StatsPage() {
  const { id } = useParams<{ id: string }>();
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setS(null);
    api<Stats>(`/api/me/shops/${id}/stats?days=${days}`).then(setS).catch((e) => setErr(e.message));
  }, [id, days]);
  const conv = s && s.totals.product_view ? Math.round((s.totals.order_click / s.totals.product_view) * 100) : 0;
  return (
    <PanelShell back={`/panel/shop/${id}`} title="Статистика">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">Статистика магазина</h2>
        <div className="w-56">
          <Segmented value={days} onChange={setDays} options={[{ value: "7", label: "7 дн." }, { value: "14", label: "14 дн." }, { value: "30", label: "30 дн." }]} />
        </div>
      </div>
      {err && <p className="text-red-300">{err}</p>}
      {!s ? (
        <div className="grid place-items-center py-24">
          <Spinner className="text-gold" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Посещения", v: formatNumber(s.totals.view) },
              { l: "Просмотры товаров", v: formatNumber(s.totals.product_view) },
              { l: "Нажали «Заказать»", v: formatNumber(s.totals.order_click) },
              { l: "Конверсия в заказ", v: `${conv}%` },
            ].map((k) => (
              <Card key={k.l} className="p-4">
                <div className="text-2xl font-black text-ink-100">{k.v}</div>
                <div className="mt-1 text-xs text-ink-400">{k.l}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarChart title="Посещения магазина по дням" days={s.days} field="view" />
            <BarChart title="Нажатия «Заказать в Telegram» по дням" days={s.days} field="order_click" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TopList title="Самые просматриваемые товары" items={s.top_viewed} />
            <TopList title="Чаще всего заказывают" items={s.top_ordered} />
          </div>
          <p className="text-xs text-ink-500">
            Всего посещений за всё время: {formatNumber(s.all_time_views)} · товаров: {s.products}
          </p>
        </div>
      )}
    </PanelShell>
  );
}
