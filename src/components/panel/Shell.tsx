"use client";
import { ChevronLeft, LogOut, Shield } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";
import { useAuth } from "./auth";
import { BrandLogo } from "./Brand";

export function PanelShell({ children, back, title, actions, wide }: { children: ReactNode; back?: string; title?: string; actions?: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-dvh bg-[radial-gradient(800px_400px_at_100%_-10%,rgba(245,165,36,0.10),transparent_60%)]">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className={cx("mx-auto flex h-14 items-center gap-3 px-4", wide ? "max-w-7xl" : "max-w-5xl")}>
          {back ? (
            <Link href={back} className="-ml-2 grid h-9 w-9 place-items-center rounded-full hover:bg-white/5" aria-label="Назад">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : null}
          {title ? <h1 className="truncate text-[15px] font-bold">{title}</h1> : <Link href="/panel"><BrandLogo compact /></Link>}
          <div className="ml-auto flex items-center gap-1.5">
            {actions}
            {user.is_admin && (
              <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-full text-gold hover:bg-white/5" title="Админ-панель">
                <Shield className="h-[18px] w-[18px]" />
              </Link>
            )}
            <div className="hidden items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold">{(user.first_name || user.username || "U").charAt(0)}</span>
              <span className="max-w-[120px] truncate text-xs text-ink-200">{user.username ? `@${user.username}` : user.first_name}</span>
            </div>
            <button type="button" onClick={logout} className="grid h-9 w-9 place-items-center rounded-full text-ink-400 hover:bg-white/5 hover:text-ink-100" title="Выйти">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className={cx("mx-auto px-4 pb-24 pt-5", wide ? "max-w-7xl" : "max-w-5xl")}>{children}</main>
    </div>
  );
}
