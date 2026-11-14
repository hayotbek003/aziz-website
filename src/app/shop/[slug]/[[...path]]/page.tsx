"use client";
import { Lock, Store } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Storefront from "@/components/store/Storefront";
import { api } from "@/lib/api";
import { normalizeConfig } from "@/lib/templates";
import { tgReady } from "@/lib/telegram";
import type { StoreData } from "@/lib/types";

type Resp =
  | ({ status: "active"; preview: boolean } & StoreData)
  | { status: "inactive"; reason: string; reason_label: string; name: string | null; slug: string };

function ShopInner() {
  const params = useParams<{ slug: string; path?: string[] }>();
  const search = useSearchParams();
  const preview = search.get("preview");
  const slug = params.slug;
  const path = "/" + (params.path || []).join("/");
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Resp>(`/api/public/shops/${encodeURIComponent(slug)}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`)
      .then((r) => {
        if (r.status === "active") r.config = normalizeConfig(r.config);
        setData(r);
        if (r.status === "active") {
          tgReady(r.config.theme.bg);
          document.title = r.config.name;
        }
      })
      .catch((e) => setError(e.message));
  }, [slug, preview]);

  const isLive = data?.status === "active" && !data.preview;
  const track = useCallback(
    (type: "view" | "product_view" | "order_click", productId?: string | number) => {
      if (!isLive) return;
      api(`/api/public/shops/${encodeURIComponent(slug)}/event`, { body: { type, product_id: productId ? Number(productId) : null } }).catch(() => {});
    },
    [slug, isLive],
  );

  useEffect(() => {
    if (!isLive) return;
    const key = `aziz_viewed_${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    track("view");
  }, [isLive, slug, track]);

  if (error) return <Message icon={<Store className="h-10 w-10 text-gold" />} title="Магазин не найден" text={error} />;
  if (!data) return <Skeleton />;
  if (data.status === "inactive") {
    return (
      <Message
        icon={<Lock className="h-10 w-10 text-gold" />}
        title={data.name ? `${data.name} — временно недоступен` : "Магазин временно недоступен"}
        text={data.reason === "blocked" ? "Магазин приостановлен администрацией платформы." : "Владелец магазина скоро вернётся. Загляните позже!"}
      />
    );
  }
  return (
    <Storefront
      data={data}
      mode={{ kind: "routed", base: `/shop/${slug}`, path }}
      onTrack={track}
      banner={
        data.preview ? (
          <div className="relative z-40 bg-gold px-4 py-1.5 text-center text-xs font-bold text-black">
            Предпросмотр черновика — покупатели видят опубликованную версию
          </div>
        ) : null
      }
    />
  );
}

function Message({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 p-6">
      <div className="panel-card flex max-w-sm flex-col items-center gap-3 rounded-3xl p-8 text-center">
        {icon}
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-ink-300">{text}</p>
        <p className="mt-4 text-xs text-ink-400">AZIZ Website</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="min-h-dvh animate-pulse bg-ink-950 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-10 w-40 rounded-xl bg-white/5" />
        <div className="h-56 rounded-3xl bg-white/5" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ShopInner />
    </Suspense>
  );
}
