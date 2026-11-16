"use client";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Field, Spinner, TextArea, TextInput, Toggle, useUi } from "@/components/panel/ui";
import { useShop } from "@/components/panel/useShop";
import LinkPage from "@/components/store/LinkPage";
import { api } from "@/lib/api";
import type { ShopConfig } from "@/lib/types";

type Links = ShopConfig["links"];

export default function LinksEditor() {
  const { id } = useParams<{ id: string }>();
  const { data, setData, error } = useShop(id);
  const { toast } = useUi();
  const [links, setLinks] = useState<Links | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || links) return;
    const d = data.published || data.draft;
    setLinks(structuredClone(d.links));
  }, [data, links]);

  if (error) return <PanelShell back={`/panel/shop/${id}`}><p className="text-red-300">{error}</p></PanelShell>;
  if (!data || !links) return <PanelShell back={`/panel/shop/${id}`} title="Ссылка для Instagram"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;

  const shop = data.shop;
  const cfg: ShopConfig = { ...(data.published || data.draft), links };
  const url = `${location.origin}/l/${shop.slug}`;
  const set = <K extends keyof Links>(k: K, v: Links[K]) => setLinks({ ...links, [k]: v });
  const setItem = (i: number, k: "label" | "url", v: string) => set("items", links.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: number) => {
    const items = [...links.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    set("items", items);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/me/shops/${id}/info`, { method: "PATCH", body: { info: { links } } });
      setData({
        ...data,
        draft: { ...data.draft, links },
        published: data.published ? { ...data.published, links } : null,
      });
      toast("Сохранено — ссылка уже обновилась");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Ссылка скопирована — вставьте её в профиль Instagram");
    } catch {
      toast(url);
    }
  };

  const c = cfg.contacts;
  const s = cfg.social;
  return (
    <PanelShell back={`/panel/shop/${id}`} title="Ссылка для Instagram" wide>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-bold">Ваша ссылка</h2>
            <p className="text-sm text-ink-300">
              Поставьте её в профиль Instagram (поле «Ссылки»). Покупатель нажимает — и видит все ваши ссылки: магазин, Telegram, канал, бота.
            </p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gold">{url}</code>
              <Button variant="gold" icon={<Copy className="h-4 w-4" />} onClick={copy}>
                Копировать
              </Button>
              <a href={url} target="_blank" rel="noopener">
                <Button icon={<ExternalLink className="h-4 w-4" />}>Открыть</Button>
              </a>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-bold">Шапка</h2>
            <Field label="Заголовок" hint={`Пусто — будет «${cfg.name}». Логотип берётся из редактора сайта.`}>
              <TextInput value={links.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder={cfg.name} />
            </Field>
            <Field label="Описание" hint="Пусто — будет слоган магазина">
              <TextArea rows={2} maxLength={300} value={links.bio} onChange={(e) => set("bio", e.target.value)} placeholder={cfg.tagline} />
            </Field>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-bold">Кнопки</h2>
            <Toggle checked={links.showShop} onChange={(v) => set("showShop", v)} label="Интернет-магазин" hint={`/shop/${shop.slug}`} />
            <Toggle checked={links.showTelegram} onChange={(v) => set("showTelegram", v)} label="Написать в Telegram" hint={c.telegram ? `@${c.telegram}` : "Укажите Telegram в настройках"} />
            <Toggle checked={links.showChannel} onChange={(v) => set("showChannel", v)} label="Telegram-канал" hint={s.telegramChannel || "Укажите канал в настройках → Социальные сети"} />
            <Toggle checked={links.showBot} onChange={(v) => set("showBot", v)} label="Бот магазина" hint={shop.bot_username ? `@${shop.bot_username}` : "Подключите бота в настройках — или напишите нам, мы сделаем его за вас"} />
            <Toggle checked={links.showInstagram} onChange={(v) => set("showInstagram", v)} label="Instagram" hint={s.instagram || "Укажите Instagram в настройках"} />
            <Toggle checked={links.showPhone} onChange={(v) => set("showPhone", v)} label="Позвонить" hint={c.phone || "Укажите телефон в настройках"} />
            <p className="text-xs text-ink-400">
              Контакты меняются в{" "}
              <Link href={`/panel/shop/${id}/settings`} className="text-gold underline">
                настройках
              </Link>
              .
            </p>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Свои ссылки</h2>
              <Button size="sm" icon={<Plus className="h-4 w-4" />} disabled={links.items.length >= 12} onClick={() => set("items", [...links.items, { label: "", url: "" }])}>
                Добавить
              </Button>
            </div>
            {!links.items.length && <p className="text-sm text-ink-400">Например: отзывы, WhatsApp, YouTube, адрес на карте, акция.</p>}
            {links.items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-2">
                <TextInput className="min-w-[140px] flex-1" value={it.label} maxLength={60} placeholder="Название" onChange={(e) => setItem(i, "label", e.target.value)} />
                <TextInput className="min-w-[180px] flex-[2]" value={it.url} maxLength={500} placeholder="https://..." onChange={(e) => setItem(i, "url", e.target.value)} />
                <div className="flex gap-1">
                  <Button size="sm" aria-label="Выше" icon={<ArrowUp className="h-4 w-4" />} onClick={() => move(i, -1)} />
                  <Button size="sm" aria-label="Ниже" icon={<ArrowDown className="h-4 w-4" />} onClick={() => move(i, 1)} />
                  <Button size="sm" variant="danger" aria-label="Удалить" icon={<Trash2 className="h-4 w-4" />} onClick={() => set("items", links.items.filter((_, j) => j !== i))} />
                </div>
              </div>
            ))}
          </Card>

          <Button variant="gold" size="lg" className="w-full" loading={busy} icon={<Save className="h-5 w-5" />} onClick={save}>
            Сохранить
          </Button>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Предпросмотр</div>
          <div className="h-[640px] overflow-y-auto rounded-[28px] border border-white/10 shadow-2xl">
            <LinkPage cfg={cfg} slug={shop.slug} botUsername={shop.bot_username} embedded />
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
