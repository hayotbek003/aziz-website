"use client";
import { BarChart3, Copy, CreditCard, ExternalLink, FolderTree, Package, Palette, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Spinner, StatusBadge, useUi } from "@/components/panel/ui";
import { useShop } from "@/components/panel/useShop";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";

type Stats = { totals: { view: number; product_view: number; order_click: number }; all_time_views: number; products: number };

export default function ShopDashboard() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useShop(id);
  const [stats, setStats] = useState<Stats | null>(null);
  const { toast } = useUi();
  useEffect(() => {
    api<Stats>(`/api/me/shops/${id}/stats?days=7`).then(setStats).catch(() => {});
  }, [id]);

  if (error) return <PanelShell back="/panel"><p className="text-red-300">{error}</p></PanelShell>;
  if (!data) return <PanelShell back="/panel"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;
  const s = data.shop;
  const tpl = TEMPLATES.find((t) => t.key === s.template);
  const tiles = [
    { href: "editor", icon: Palette, title: "Редактор сайта", text: "Дизайн, баннеры, блоки, страницы" },
    { href: "products", icon: Package, title: "Товары", text: `${data.products.length} товаров · фото, цены, наличие` },
    { href: "categories", icon: FolderTree, title: "Категории", text: `${data.categories.length} категорий` },
    { href: "settings", icon: Settings, title: "Настройки", text: "Контакты, Telegram, бот, язык, адрес" },
    { href: "stats", icon: BarChart3, title: "Статистика", text: "Просмотры и нажатия «Заказать»" },
    { href: "billing", icon: CreditCard, title: "Срок аренды", text: `до ${formatDate(s.status.expires_at)}` },
  ];
  return (
    <PanelShell back="/panel" title={s.name}>
      <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-0 -z-10 opacity-60" style={{ background: `radial-gradient(500px 200px at 100% 0%, ${s.primary || "#F5A524"}40, transparent 70%)` }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-400">
              {tpl?.emoji} Шаблон {tpl?.name}
            </div>
            <h2 className="text-2xl font-black">{s.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              {s.has_unpublished && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">Есть неопубликованные изменения</span>}
            </div>
          </div>
          <a href={`/shop/${s.slug}`} target="_blank" rel="noopener">
            <Button variant="gold" icon={<ExternalLink className="h-4 w-4" />}>
              Открыть сайт
            </Button>
          </a>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-gold">{s.url}</span>
          <Button
            size="sm"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={() => {
              navigator.clipboard?.writeText(s.url);
              toast("Ссылка скопирована");
            }}
          >
            Копировать
          </Button>
        </div>
        {!s.status.is_live && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div>
              {s.status.state === "blocked" ? (
                <>Магазин заблокирован администратором{s.block_reason ? `: ${s.block_reason}` : ""}.</>
              ) : (
                <>
                  Магазин скрыт от покупателей — срок аренды закончился.{" "}
                  <Link href={`/panel/shop/${s.id}/billing`} className="font-semibold text-gold underline">
                    Продлить аренду
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Просмотры (7 дн.)", value: stats?.totals.view },
          { label: "Просмотры товаров", value: stats?.totals.product_view },
          { label: "Нажали «Заказать»", value: stats?.totals.order_click },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-2xl font-black text-gold">{k.value === undefined ? "—" : formatNumber(k.value)}</div>
            <div className="mt-1 text-xs text-ink-400">{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={`/panel/shop/${s.id}/${t.href}`}>
            <Card className="group flex h-full items-center gap-4 p-4 transition hover:border-gold/50">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold transition group-hover:bg-gold group-hover:text-black">
                <t.icon className="h-6 w-6" />
              </span>
              <span>
                <span className="block font-bold">{t.title}</span>
                <span className="block text-sm text-ink-400">{t.text}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </PanelShell>
  );
}
