"use client";
import { Bot, Lock, Save, Trash2, Unplug } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Field, Segmented, Select, Spinner, TextArea, TextInput, useUi } from "@/components/panel/ui";
import { useShop } from "@/components/panel/useShop";
import { api } from "@/lib/api";
import type { ShopConfig, ShopSummary } from "@/lib/types";

type Info = Pick<ShopConfig, "name" | "tagline" | "description" | "language" | "currency" | "contacts" | "social">;

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, setData, error } = useShop(id);
  const { toast, confirm } = useUi();
  const [info, setInfo] = useState<Info | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState("");
  const [botToken, setBotToken] = useState("");

  useEffect(() => {
    if (!data || info) return;
    const d = data.published || data.draft;
    setInfo({ name: d.name, tagline: d.tagline, description: d.description, language: d.language, currency: d.currency, contacts: { ...d.contacts }, social: { ...d.social } });
    setSlug(data.shop.slug);
  }, [data, info]);

  if (error) return <PanelShell back={`/panel/shop/${id}`}><p className="text-red-300">{error}</p></PanelShell>;
  if (!data || !info) return <PanelShell back={`/panel/shop/${id}`} title="Настройки"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;
  const shop = data.shop;
  const setC = (k: keyof Info["contacts"], v: string) => setInfo({ ...info, contacts: { ...info.contacts, [k]: v } });
  const setS = (k: keyof Info["social"], v: string) => setInfo({ ...info, social: { ...info.social, [k]: v } });

  const save = async () => {
    setBusy("save");
    try {
      const r = await api<{ shop: ShopSummary }>(`/api/me/shops/${id}/info`, { method: "PATCH", body: { info, slug } });
      setData({ ...data, shop: r.shop });
      toast("Настройки сохранены и применены на сайте");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const connectBot = async () => {
    setBusy("bot");
    try {
      const r = await api<{ bot_username: string; webhook: boolean }>(`/api/me/shops/${id}/bot`, { body: { token: botToken } });
      setBotToken("");
      setData({ ...data, shop: { ...shop, bot_username: r.bot_username } });
      toast(`Бот @${r.bot_username} подключён`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const disconnectBot = async () => {
    if (!(await confirm("Отключить Telegram-бота от магазина? Токен будет удалён с сервера.", { danger: true, ok: "Отключить" }))) return;
    await api(`/api/me/shops/${id}/bot`, { method: "DELETE" });
    setData({ ...data, shop: { ...shop, bot_username: null } });
    toast("Бот отключён");
  };

  const removeShop = async () => {
    if (!(await confirm(`Удалить магазин «${shop.name}» со всеми товарами и фото? Это нельзя отменить.`, { danger: true, ok: "Удалить навсегда" }))) return;
    try {
      await api(`/api/me/shops/${id}`, { method: "DELETE" });
      toast("Магазин удалён");
      router.replace("/panel");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <PanelShell back={`/panel/shop/${id}`} title={`Настройки · ${shop.name}`}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Основное</h2>
          <Field label="Имя магазина">
            <TextInput value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} maxLength={80} />
          </Field>
          <Field label="Слоган">
            <TextInput value={info.tagline} onChange={(e) => setInfo({ ...info, tagline: e.target.value })} />
          </Field>
          <Field label="Описание бизнеса">
            <TextArea rows={3} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} />
          </Field>
          <Field label="Адрес сайта" hint={`${location.origin}/shop/${slug}`}>
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={40} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Язык сайта">
              <Segmented value={info.language} onChange={(v) => setInfo({ ...info, language: v })} options={[{ value: "ru", label: "RU" }, { value: "uz", label: "UZ" }]} />
            </Field>
            <Field label="Валюта">
              <Select value={info.currency} onChange={(v) => setInfo({ ...info, currency: v })} options={["сум", "so'm", "UZS", "$", "₽", "₸"].map((x) => ({ value: x, label: x }))} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Telegram и контакты</h2>
          <Field label="Telegram продавца (заказы)" hint="Покупатель нажимает «Заказать в Telegram» → открывается чат с вами и готовым сообщением о товаре">
            <TextInput value={info.contacts.telegram} placeholder="@username" onChange={(e) => setC("telegram", e.target.value.replace(/^@/, ""))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Телефон">
              <TextInput value={info.contacts.phone} onChange={(e) => setC("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <TextInput value={info.contacts.email} onChange={(e) => setC("email", e.target.value)} />
            </Field>
            <Field label="Адрес">
              <TextInput value={info.contacts.address} onChange={(e) => setC("address", e.target.value)} />
            </Field>
            <Field label="Время работы">
              <TextInput value={info.contacts.hours} onChange={(e) => setC("hours", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="font-bold">Социальные сети</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["instagram", "Instagram"],
                ["telegramChannel", "Telegram-канал"],
                ["facebook", "Facebook"],
                ["youtube", "YouTube"],
                ["tiktok", "TikTok"],
                ["whatsapp", "WhatsApp"],
                ["website", "Сайт"],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                <TextInput value={info.social[k]} onChange={(e) => setS(k, e.target.value)} placeholder="username или ссылка" />
              </Field>
            ))}
          </div>
        </Card>

        <Button variant="gold" size="lg" className="w-full" loading={busy === "save"} icon={<Save className="h-5 w-5" />} onClick={save}>
          Сохранить настройки
        </Button>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-gold" />
            <h2 className="font-bold">Telegram-бот магазина</h2>
          </div>
          <p className="text-sm text-ink-300">
            Подключите своего бота из @BotFather: у него появится кнопка «Магазин», которая открывает ваш сайт как Telegram Web App, а на /start бот
            предложит открыть магазин.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <Lock className="h-3.5 w-3.5" /> Токен хранится только на сервере в зашифрованном виде и никогда не показывается в браузере.
          </p>
          {shop.bot_username ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <span className="text-sm">
                Подключён: <b>@{shop.bot_username}</b>
              </span>
              <Button size="sm" variant="danger" icon={<Unplug className="h-3.5 w-3.5" />} onClick={disconnectBot}>
                Отключить
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <TextInput type="password" autoComplete="off" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456789:AA..." />
              <Button variant="gold" loading={busy === "bot"} disabled={!botToken} onClick={connectBot}>
                Подключить
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex items-center justify-between gap-3 border-red-500/20 p-5">
          <div>
            <h2 className="font-bold text-red-200">Удалить магазин</h2>
            <p className="text-sm text-ink-400">Магазин, товары и фото будут удалены навсегда.</p>
          </div>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={removeShop}>
            Удалить
          </Button>
        </Card>
      </div>
    </PanelShell>
  );
}
