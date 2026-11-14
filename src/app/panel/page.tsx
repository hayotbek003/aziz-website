"use client";
import { ExternalLink, Plus, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/panel/auth";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Empty, Spinner, StatusBadge } from "@/components/panel/ui";
import { api } from "@/lib/api";
import { formatDate, mediaUrl } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";
import type { ShopSummary } from "@/lib/types";

export default function PanelHome() {
  const { user } = useAuth();
  const [shops, setShops] = useState<ShopSummary[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ shops: ShopSummary[] }>("/api/me/shops")
      .then((r) => setShops(r.shops))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <PanelShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-400">Привет, {user.first_name || user.username} 👋</p>
          <h1 className="text-2xl font-black sm:text-3xl">Мои сайты</h1>
        </div>
        <Link href="/panel/new">
          <Button variant="gold" icon={<Plus className="h-4 w-4" />}>
            Создать сайт
          </Button>
        </Link>
      </div>
      {err && <p className="text-sm text-red-300">{err}</p>}
      {!shops && !err && (
        <div className="grid place-items-center py-20">
          <Spinner className="text-gold" />
        </div>
      )}
      {shops && shops.length === 0 && (
        <Empty
          icon={<Store className="h-7 w-7" />}
          title="У вас пока нет магазина"
          text={user.trial_used ? "Выберите шаблон и оформите аренду." : "Создайте первый магазин — 7 дней бесплатно, без привязки карты."}
          action={
            <Link href="/panel/new">
              <Button variant="gold" icon={<Sparkles className="h-4 w-4" />}>
                Создать магазин
              </Button>
            </Link>
          }
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {shops?.map((s) => {
          const tpl = TEMPLATES.find((t) => t.key === s.template);
          return (
            <Card key={s.id} className="overflow-hidden">
              <Link href={`/panel/shop/${s.id}`} className="block">
                <div className="relative h-24 overflow-hidden" style={{ background: `radial-gradient(circle at 80% 0%, ${s.primary || "#F5A524"}66, transparent 60%), #0B0B0E` }}>
                  <div className="absolute bottom-3 left-4 flex items-center gap-3">
                    {s.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(s.logo)} alt="" className="h-11 w-11 rounded-xl bg-black/40 object-contain" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-xl text-lg font-black text-black" style={{ background: s.primary || "#F5A524" }}>
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <div className="text-lg font-bold leading-tight">{s.name}</div>
                      <div className="text-xs text-ink-300">
                        {tpl?.emoji} {tpl?.name} · /shop/{s.slug}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-ink-400">до {formatDate(s.status.expires_at)}</span>
                </div>
                <div className="flex gap-2">
                  <a href={`/shop/${s.slug}`} target="_blank" rel="noopener">
                    <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                      Сайт
                    </Button>
                  </a>
                  <Link href={`/panel/shop/${s.id}`}>
                    <Button size="sm" variant="gold">
                      Управлять
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {shops && shops.length > 0 && (
        <p className="mt-8 text-center text-xs text-ink-500">
          Доступно шаблонов: {TEMPLATES.length}. Каждый магазин редактируется независимо.
        </p>
      )}
    </PanelShell>
  );
}
