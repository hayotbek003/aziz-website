"use client";
import { LogOut, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "@/lib/api";
import { tg, tgReady } from "@/lib/telegram";
import type { UserInfo } from "@/lib/types";
import { BrandLogo, BrandMark } from "./Brand";
import { Button, Card, Spinner, TextInput, UiProvider } from "./ui";

type PublicConfig = { bot_username: string; dev_mode: boolean; trial_days: number; webapp_url: string };
type AuthCtx = { user: UserInfo; config: PublicConfig; logout: () => void; refresh: () => Promise<void> };

const Ctx = createContext<AuthCtx | null>(null);
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}

export function AuthGate({ children, requireAdmin }: { children: ReactNode; requireAdmin?: boolean }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    tgReady("#050506");
    const cfg = await api<PublicConfig>("/api/public/config").catch(
      () => ({ bot_username: "", dev_mode: false, trial_days: 7, webapp_url: "" }) as PublicConfig,
    );
    setConfig(cfg);
    try {
      const w = tg();
      if (w?.initData) {
        // Внутри Telegram всегда входим по свежей подписи initData
        const r = await api<{ token: string; user: UserInfo }>("/api/auth/telegram", { body: { initData: w.initData } });
        setToken(r.token);
        setUser(r.user);
        setState("ready");
        return;
      }
      if (getToken()) {
        const r = await api<{ user: UserInfo }>("/api/auth/me");
        setUser(r.user);
        setState("ready");
        return;
      }
      setState("login");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState("login");
      else {
        setError((e as Error).message);
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const logout = () => {
    setToken(null);
    setUser(null);
    setState("login");
  };

  if (state === "loading" || !config) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <BrandMark size={52} className="animate-pulse" />
          <Spinner className="text-gold" />
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <Center>
        <p className="text-sm text-red-300">{error}</p>
        <Button variant="gold" onClick={load}>
          Повторить
        </Button>
      </Center>
    );
  }
  if (state === "login" || !user) return <Login config={config} onDone={load} />;
  if (requireAdmin && !user.is_admin) {
    return (
      <Center>
        <ShieldCheck className="h-10 w-10 text-gold" />
        <h1 className="text-xl font-bold">Только для администратора</h1>
        <p className="text-sm text-ink-300">Ваш Telegram ID: {user.telegram_id}. Добавьте его в ADMIN_TELEGRAM_IDS.</p>
        <div className="flex gap-2">
          <Link href="/panel">
            <Button>В кабинет</Button>
          </Link>
          <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            Выйти
          </Button>
        </div>
      </Center>
    );
  }
  return (
    <Ctx.Provider value={{ user, config, logout, refresh: load }}>
      <UiProvider>{children}</UiProvider>
    </Ctx.Provider>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">{children}</Card>
    </div>
  );
}

function Login({ config, onDone }: { config: PublicConfig; onDone: () => void }) {
  const bot = config.bot_username;
  const [tid, setTid] = useState("100001");
  const [name, setName] = useState("demo_seller");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const devLogin = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>("/api/auth/dev", { body: { telegram_id: Number(tid), username: name, first_name: name } });
      setToken(r.token);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <Card className="w-full max-w-md p-7">
        <BrandLogo />
        <h1 className="mt-6 text-2xl font-black">Вход в личный кабинет</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          Кабинет открывается прямо в Telegram: нажмите кнопку «Мои сайты» в боте. Чтобы войти с компьютера, отправьте боту команду{" "}
          <code className="rounded bg-white/5 px-1 text-gold">/login</code> — он пришлёт одноразовую ссылку.
        </p>
        {bot ? (
          <a href={`https://t.me/${bot}?start=login`} target="_blank" rel="noopener" className="mt-5 block">
            <Button variant="gold" size="lg" className="w-full" icon={<Send className="h-5 w-5" />}>
              Открыть @{bot}
            </Button>
          </a>
        ) : (
          <p className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Бот ещё не настроен (BOT_TOKEN).</p>
        )}
        {config.dev_mode && (
          <div className="mt-6 border-t border-white/5 pt-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-400">Режим разработки</div>
            <div className="grid grid-cols-2 gap-2">
              <TextInput value={tid} onChange={(e) => setTid(e.target.value)} placeholder="Telegram ID" />
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="username" />
            </div>
            <Button className="mt-2 w-full" loading={busy} onClick={devLogin}>
              Войти как тестовый пользователь
            </Button>
            {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
