"use client";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import Storefront from "@/components/store/Storefront";
import { demoStore, TEMPLATES } from "@/lib/templates";
import { tgReady } from "@/lib/telegram";

export default function DemoPage() {
  const params = useParams<{ key: string; path?: string[] }>();
  const data = useMemo(() => demoStore(params.key), [params.key]);
  const path = "/" + (params.path || []).join("/");
  const meta = TEMPLATES.find((t) => t.key === params.key);

  useEffect(() => {
    if (data) tgReady(data.config.theme.bg);
  }, [data]);

  if (!data || !meta) {
    return (
      <div className="grid min-h-dvh place-items-center text-ink-300">
        Шаблон не найден. <Link href="/" className="text-gold">На главную</Link>
      </div>
    );
  }
  return (
    <Storefront
      data={data}
      mode={{ kind: "routed", base: `/demo/${params.key}`, path }}
      banner={
        <div className="relative z-40 flex items-center justify-between gap-2 border-b border-gold/30 bg-black/90 px-3 py-2 text-xs text-white backdrop-blur">
          <Link href="/#templates" className="flex items-center gap-1 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Шаблоны
          </Link>
          <span className="truncate font-semibold">
            Демо: {meta.emoji} {meta.name}
          </span>
          <Link href={`/panel/new?template=${meta.key}`} className="gold-btn flex items-center gap-1 rounded-full px-3 py-1 font-bold">
            <Check className="h-3.5 w-3.5" /> Выбрать
          </Link>
        </div>
      }
    />
  );
}
