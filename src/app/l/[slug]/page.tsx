"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LinkPage from "@/components/store/LinkPage";
import { api } from "@/lib/api";
import { normalizeConfig } from "@/lib/templates";
import type { ShopConfig } from "@/lib/types";

type Resp =
  | { status: "active"; slug: string; bot_username: string | null; config: ShopConfig }
  | { status: "inactive"; name: string | null };

/** Короткая страница-визитка для Instagram: /l/<адрес магазина>. */
export default function LinksPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Resp>(`/api/public/shops/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (r.status === "active") {
          r.config = normalizeConfig(r.config);
          document.title = r.config.links.title || r.config.name;
          document.body.style.background = r.config.theme.bg;
        }
        setData(r);
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error || data?.status === "inactive") {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">{data?.status === "inactive" && data.name ? `${data.name} — временно недоступен` : "Страница не найдена"}</h1>
          <p className="mt-2 text-xs text-ink-400">AZIZ Website</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="min-h-dvh bg-ink-950" />;
  return <LinkPage cfg={data.config} slug={data.slug} botUsername={data.bot_username} />;
}
