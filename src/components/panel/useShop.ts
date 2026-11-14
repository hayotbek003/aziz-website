"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeConfig } from "@/lib/templates";
import type { Category, Product, ShopConfig, ShopSummary } from "@/lib/types";

export type ShopFull = {
  shop: ShopSummary;
  draft: ShopConfig;
  published: ShopConfig | null;
  categories: Category[];
  products: Product[];
};

export function useShop(id: string | number) {
  const [data, setData] = useState<ShopFull | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const r = await api<ShopFull>(`/api/me/shops/${id}`);
      r.draft = normalizeConfig(r.draft);
      r.published = r.published ? normalizeConfig(r.published) : null;
      setData(r);
      setError("");
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, reload };
}
