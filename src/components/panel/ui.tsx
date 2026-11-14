"use client";
import { Check, ChevronDown, ImagePlus, Loader2, Trash2, X, ArrowLeft, ArrowRight } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { uploadImage } from "@/lib/api";
import { cx, mediaUrl } from "@/lib/format";
import { Icon, ICON_NAMES } from "@/lib/icons";
import type { ShopStatus } from "@/lib/types";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin", className)} />;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "gold" | "dark" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "dark", size = "md", loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "gold" && "gold-btn",
        variant === "dark" && "border border-white/10 bg-ink-800 text-ink-100 hover:bg-ink-700",
        variant === "outline" && "border border-gold/50 text-gold hover:bg-gold/10",
        variant === "ghost" && "text-ink-200 hover:bg-white/5",
        variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
        className,
      )}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("panel-card rounded-2xl", className)}>{children}</div>;
}

export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("input", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx("input min-h-[90px] resize-y leading-relaxed", props.className)} />;
}

export function Select({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={cx("relative", className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input appearance-none pr-9">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-1 text-left">
      <span>
        {label && <span className="block text-sm font-medium text-ink-100">{label}</span>}
        {hint && <span className="block text-xs text-ink-400">{hint}</span>}
      </span>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-gold" : "bg-ink-600")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl border border-white/10 bg-ink-900 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("flex-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold transition", value === o.value ? "bg-gold text-black" : "text-ink-300 hover:text-ink-100")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-900 p-2">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/20" style={{ background: value }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink-400">{label}</span>
        <input
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.startsWith("#") ? v.toUpperCase() : `#${v.toUpperCase()}`);
          }}
          className="w-full bg-transparent font-mono text-sm text-ink-100 outline-none"
        />
      </span>
    </label>
  );
}

const STATUS: Record<ShopStatus["state"], { label: string; cls: string }> = {
  trial: { label: "Пробный период", cls: "bg-sky-500/15 text-sky-300" },
  active: { label: "Оплачен", cls: "bg-emerald-500/15 text-emerald-300" },
  expired: { label: "Срок истёк", cls: "bg-red-500/15 text-red-300" },
  unpaid: { label: "Ожидает оплаты", cls: "bg-amber-500/15 text-amber-300" },
  blocked: { label: "Заблокирован", cls: "bg-red-600/20 text-red-300" },
};

export function StatusBadge({ status }: { status: ShopStatus }) {
  const s = STATUS[status.state];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls)}>
      {s.label}
      {status.is_live && status.days_left > 0 && <span className="opacity-80">· {status.days_left} дн.</span>}
    </span>
  );
}

/* ---------- Модальное окно (на телефоне — нижний лист) ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx("relative flex max-h-[92dvh] w-full animate-fadein flex-col rounded-t-3xl border border-white/10 bg-ink-900 sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h3 className="text-base font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/5" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-white/5 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Подтверждение и уведомления ---------- */
type Toast = { id: number; text: string; kind: "ok" | "err" };
type UiCtx = {
  toast: (text: string, kind?: "ok" | "err") => void;
  confirm: (text: string, opts?: { danger?: boolean; ok?: string }) => Promise<boolean>;
};
const UiContext = createContext<UiCtx | null>(null);

export function useUi() {
  const c = useContext(UiContext);
  if (!c) throw new Error("UiProvider missing");
  return c;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<{ text: string; danger?: boolean; ok?: string; resolve: (v: boolean) => void } | null>(null);
  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const confirm = useCallback(
    (text: string, opts?: { danger?: boolean; ok?: string }) => new Promise<boolean>((resolve) => setAsk({ text, ...opts, resolve })),
    [],
  );
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto flex animate-fadein items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur", t.kind === "ok" ? "border-gold/40 bg-ink-900/95 text-ink-100" : "border-red-500/40 bg-red-950/95 text-red-100")}>
            {t.kind === "ok" ? <Check className="h-4 w-4 text-gold" /> : <X className="h-4 w-4 text-red-300" />}
            {t.text}
          </div>
        ))}
      </div>
      <Modal
        open={!!ask}
        onClose={() => close(false)}
        title="Подтверждение"
        footer={
          <>
            <Button className="flex-1" onClick={() => close(false)}>
              Отмена
            </Button>
            <Button className="flex-1" variant={ask?.danger ? "danger" : "gold"} onClick={() => close(true)}>
              {ask?.ok || "Да"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-200">{ask?.text}</p>
      </Modal>
    </UiContext.Provider>
  );
}

/* ---------- Загрузка изображений ---------- */
export function ImageInput({ value, onChange, shopId, label, aspect = "aspect-video", contain }: { value: string | null; onChange: (v: string | null) => void; shopId?: number; label?: string; aspect?: string; contain?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadImage(f, shopId));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className={cx("group relative overflow-hidden rounded-xl border border-dashed border-white/15 bg-ink-900", aspect)}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(value)} alt="" className={cx("h-full w-full", contain ? "object-contain p-2" : "object-cover")} />
        ) : (
          <button type="button" onClick={() => ref.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400 hover:text-gold">
            {busy ? <Spinner /> : <ImagePlus className="h-6 w-6" />}
            <span className="text-xs">Загрузить фото</span>
          </button>
        )}
        {value && (
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={() => ref.current?.click()} className="rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold text-white hover:bg-black">
              {busy ? "…" : "Заменить"}
            </button>
            <button type="button" onClick={() => onChange(null)} className="grid h-7 w-7 place-items-center rounded-lg bg-black/70 text-red-300 hover:bg-black" aria-label="Удалить">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

export function ImagesInput({ value, onChange, shopId, max = 10 }: { value: string[]; onChange: (v: string[]) => void; shopId?: number; max?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const { toast } = useUi();
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, max - value.length);
    setBusy(list.length);
    const ids: string[] = [];
    for (const f of list) {
      try {
        ids.push(await uploadImage(f, shopId));
      } catch (e) {
        toast((e as Error).message, "err");
      }
      setBusy((b) => b - 1);
    }
    onChange([...value, ...ids]);
    if (ref.current) ref.current.value = "";
  };
  const move = (i: number, d: number) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {value.map((id, i) => (
        <div key={id + i} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-ink-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(id)} alt="" className="h-full w-full object-cover" />
          {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-gold px-1.5 text-[10px] font-bold text-black">Главное</span>}
          <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
            <button type="button" onClick={() => move(i, -1)} className="grid h-6 w-6 place-items-center rounded-md bg-black/70 text-white" aria-label="Влево">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onChange(value.filter((_, x) => x !== i))} className="grid h-6 w-6 place-items-center rounded-md bg-black/70 text-red-300" aria-label="Удалить">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="grid h-6 w-6 place-items-center rounded-md bg-black/70 text-white" aria-label="Вправо">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => ref.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-ink-900 text-ink-400 hover:border-gold/60 hover:text-gold">
          {busy ? <Spinner /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-[11px]">{busy ? `Загрузка ${busy}…` : "Добавить"}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
    </div>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-[42px] items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 text-sm hover:border-gold/50">
        <Icon name={value} className="h-5 w-5 text-gold" />
        <span className="text-ink-300">Иконка</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Выберите иконку">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              title={n}
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
              className={cx("grid aspect-square place-items-center rounded-xl border", n === value ? "border-gold bg-gold/15 text-gold" : "border-white/5 bg-ink-850 text-ink-200 hover:border-gold/40")}
            >
              <Icon name={n} className="h-5 w-5" />
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/10 text-gold">{icon}</div>
      <div className="text-lg font-bold">{title}</div>
      {text && <p className="max-w-sm text-sm text-ink-300">{text}</p>}
      {action}
    </Card>
  );
}
