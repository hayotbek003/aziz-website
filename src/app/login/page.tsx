"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandMark } from "@/components/panel/Brand";
import { api, setToken } from "@/lib/api";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [err, setErr] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      router.replace("/panel");
      return;
    }
    api<{ token: string }>("/api/auth/magic", { body: { token } })
      .then((r) => {
        setToken(r.token);
        router.replace("/panel");
      })
      .catch((e) => setErr(e.message));
  }, [params, router]);
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={56} className={err ? "" : "animate-pulse"} />
        <p className={err ? "text-red-300" : "text-ink-300"}>{err || "Выполняем вход…"}</p>
        {err && (
          <a href="/panel" className="text-sm text-gold">
            В кабинет
          </a>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
