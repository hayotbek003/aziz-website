"use client";
import { Copy, Package, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Empty, Field, IconPicker, ImagesInput, Modal, Select, Spinner, TextArea, TextInput, Toggle, useUi } from "@/components/panel/ui";
import { useShop } from "@/components/panel/useShop";
import { api } from "@/lib/api";
import { cx, formatPrice, mediaUrl } from "@/lib/format";
import { Icon } from "@/lib/icons";
import type { Category, Product, Spec } from "@/lib/types";

type Draft = Omit<Product, "id" | "sort" | "createdAt"> & { id?: number | string };

const EMPTY: Draft = {
  categoryId: null, name: "", price: 0, oldPrice: null, priceFrom: false, description: "", specs: [], images: [], icon: "Package",
  isPopular: false, inStock: true, stockQty: null,
};

export default function ProductsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, setData, error } = useShop(id);
  const { toast, confirm } = useUi();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    if (!data) return [];
    return data.products.filter(
      (p) => (cat === "all" || String(p.categoryId ?? "none") === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
    );
  }, [data, q, cat]);

  if (error) return <PanelShell back={`/panel/shop/${id}`}><p className="text-red-300">{error}</p></PanelShell>;
  if (!data) return <PanelShell back={`/panel/shop/${id}`} title="Товары"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;
  const currency = data.draft.currency;
  const catName = (cid: Product["categoryId"]) => data.categories.find((c) => c.id === cid)?.name || "Без категории";

  const setProducts = (fn: (p: Product[]) => Product[]) => setData({ ...data, products: fn(data.products) });

  const saveProduct = async () => {
    if (!edit) return;
    if (!edit.name.trim()) return toast("Введите название товара", "err");
    setSaving(true);
    const body = { ...edit, specs: edit.specs.filter((s) => s.k.trim() || s.v.trim()), categoryId: edit.categoryId ? Number(edit.categoryId) : null };
    try {
      if (edit.id) {
        const r = await api<{ product: Product }>(`/api/me/products/${edit.id}`, { method: "PUT", body });
        setProducts((ps) => ps.map((p) => (p.id === r.product.id ? r.product : p)));
      } else {
        const r = await api<{ product: Product }>(`/api/me/shops/${id}/products`, { body });
        setProducts((ps) => [...ps, r.product]);
      }
      toast("Товар сохранён");
      setEdit(null);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const quick = async (p: Product, patch: Partial<Pick<Product, "isPopular" | "inStock">>) => {
    try {
      const r = await api<{ product: Product }>(`/api/me/products/${p.id}`, { method: "PATCH", body: patch });
      setProducts((ps) => ps.map((x) => (x.id === p.id ? r.product : x)));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const remove = async (p: Product) => {
    if (!(await confirm(`Удалить товар «${p.name}»? Это действие нельзя отменить.`, { danger: true, ok: "Удалить" }))) return;
    try {
      await api(`/api/me/products/${p.id}`, { method: "DELETE" });
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
      toast("Товар удалён");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <PanelShell back={`/panel/shop/${id}`} title={`Товары · ${data.shop.name}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товара" className="pl-9" />
        </div>
        <Select
          value={cat}
          onChange={setCat}
          className="w-44"
          options={[{ value: "all", label: "Все категории" }, ...data.categories.map((c) => ({ value: String(c.id), label: c.name })), { value: "none", label: "Без категории" }]}
        />
        <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ ...EMPTY, categoryId: data.categories[0]?.id ?? null })}>
          Добавить товар
        </Button>
      </div>
      <p className="mb-3 text-xs text-ink-400">Товары, цены и наличие обновляются на сайте сразу после сохранения.</p>

      {data.products.length === 0 ? (
        <Empty icon={<Package className="h-7 w-7" />} title="Пока нет товаров" text="Добавьте первый товар: фото, цену и описание." action={<Button variant="gold" onClick={() => setEdit({ ...EMPTY })}>Добавить товар</Button>} />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-2.5 pr-3">
              <button type="button" onClick={() => setEdit({ ...p })} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-850">
                {p.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(p.images[0])} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-gold/80">
                    <Icon name={p.icon} className="h-7 w-7" />
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setEdit({ ...p })} className="min-w-0 flex-1 text-left">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-sm font-bold text-gold">
                  {p.priceFrom && "от "}
                  {formatPrice(p.price, currency)}
                </div>
                <div className="truncate text-xs text-ink-400">
                  {catName(p.categoryId)} · {p.images.length} фото
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => quick(p, { isPopular: !p.isPopular })} className={cx("grid h-8 w-8 place-items-center rounded-lg", p.isPopular ? "bg-gold/15 text-gold" : "text-ink-500 hover:text-ink-200")} title="Популярный">
                  <Star className="h-4 w-4" fill={p.isPopular ? "currentColor" : "none"} />
                </button>
                <button type="button" onClick={() => quick(p, { inStock: !p.inStock })} className={cx("hidden rounded-lg px-2 py-1 text-[11px] font-semibold sm:block", p.inStock ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
                  {p.inStock ? "В наличии" : "Нет"}
                </button>
                <button type="button" onClick={() => setEdit({ ...p, id: undefined, name: `${p.name} (копия)` })} className="hidden h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink-100 sm:grid" title="Дублировать">
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEdit({ ...p })} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink-100" title="Редактировать">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg text-red-300/70 hover:text-red-300" title="Удалить">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
          {list.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Ничего не найдено</p>}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Редактировать товар" : "Новый товар"}
        wide
        footer={
          <>
            <Button className="flex-1" onClick={() => setEdit(null)}>
              Отмена
            </Button>
            <Button className="flex-1" variant="gold" loading={saving} onClick={saveProduct}>
              Сохранить
            </Button>
          </>
        }
      >
        {edit && <ProductForm value={edit} onChange={setEdit} categories={data.categories} shopId={Number(id)} currency={currency} />}
      </Modal>
    </PanelShell>
  );
}

function ProductForm({ value: v, onChange, categories, shopId, currency }: { value: Draft; onChange: (d: Draft) => void; categories: Category[]; shopId: number; currency: string }) {
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => onChange({ ...v, [k]: val });
  const setSpec = (i: number, s: Spec) => set("specs", v.specs.map((x, j) => (j === i ? s : x)));
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Фотографии (первое — главное)</span>
        <ImagesInput value={v.images} onChange={(imgs) => set("images", imgs)} shopId={shopId} />
      </div>
      <Field label="Название">
        <TextInput value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={160} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Цена, ${currency}`}>
          <TextInput inputMode="numeric" value={v.price ? String(v.price) : ""} onChange={(e) => set("price", Number(e.target.value.replace(/\D/g, "")) || 0)} placeholder="0" />
        </Field>
        <Field label="Старая цена (скидка)">
          <TextInput inputMode="numeric" value={v.oldPrice ? String(v.oldPrice) : ""} onChange={(e) => set("oldPrice", Number(e.target.value.replace(/\D/g, "")) || null)} placeholder="—" />
        </Field>
      </div>
      <Toggle label="Цена «от»" hint="Например, «от 7 000 сум» для товаров с разными вариантами" checked={v.priceFrom} onChange={(x) => set("priceFrom", x)} />
      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label="Категория">
          <Select value={v.categoryId ? String(v.categoryId) : ""} onChange={(x) => set("categoryId", x ? Number(x) : null)} options={[{ value: "", label: "Без категории" }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
        </Field>
        <IconPicker value={v.icon} onChange={(x) => set("icon", x)} />
      </div>
      <Field label="Описание">
        <TextArea rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
      </Field>
      <div>
        <span className="label">Характеристики</span>
        <div className="space-y-2">
          {v.specs.map((s, i) => (
            <div key={i} className="flex gap-2">
              <TextInput value={s.k} placeholder="Параметр" onChange={(e) => setSpec(i, { ...s, k: e.target.value })} />
              <TextInput value={s.v} placeholder="Значение" onChange={(e) => setSpec(i, { ...s, v: e.target.value })} />
              <button type="button" onClick={() => set("specs", v.specs.filter((_, j) => j !== i))} className="grid w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-300" aria-label="Удалить">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set("specs", [...v.specs, { k: "", v: "" }])} className="flex items-center gap-2 text-sm font-semibold text-gold">
            <Plus className="h-4 w-4" /> Добавить характеристику
          </button>
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <Toggle label="Популярный товар" hint="Показывается в блоке «Популярные товары»" checked={v.isPopular} onChange={(x) => set("isPopular", x)} />
        <Toggle label="В наличии" checked={v.inStock} onChange={(x) => set("inStock", x)} />
        {v.inStock && (
          <Field label="Количество (необязательно)">
            <TextInput inputMode="numeric" value={v.stockQty ? String(v.stockQty) : ""} onChange={(e) => set("stockQty", Number(e.target.value.replace(/\D/g, "")) || null)} placeholder="Не указывать" />
          </Field>
        )}
      </div>
    </div>
  );
}
