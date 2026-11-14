"use client";
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, Empty, Field, IconPicker, ImageInput, Modal, Spinner, TextArea, TextInput, useUi } from "@/components/panel/ui";
import { useShop } from "@/components/panel/useShop";
import { api } from "@/lib/api";
import { Icon } from "@/lib/icons";
import type { Category } from "@/lib/types";

type Draft = { id?: number | string; name: string; icon: string; image: string | null; description: string };

export default function CategoriesPage() {
  const { id } = useParams<{ id: string }>();
  const { data, setData, error } = useShop(id);
  const { toast, confirm } = useUi();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (error) return <PanelShell back={`/panel/shop/${id}`}><p className="text-red-300">{error}</p></PanelShell>;
  if (!data) return <PanelShell back={`/panel/shop/${id}`} title="Категории"><div className="grid place-items-center py-24"><Spinner className="text-gold" /></div></PanelShell>;
  const cats = data.categories;
  const setCats = (c: Category[]) => setData({ ...data, categories: c });
  const count = (cid: Category["id"]) => data.products.filter((p) => p.categoryId === cid).length;

  const save = async () => {
    if (!edit?.name.trim()) return toast("Введите название", "err");
    setSaving(true);
    try {
      const body = { name: edit.name, icon: edit.icon, image: edit.image, description: edit.description };
      if (edit.id) {
        const r = await api<{ category: Category }>(`/api/me/categories/${edit.id}`, { method: "PUT", body });
        setCats(cats.map((c) => (c.id === r.category.id ? r.category : c)));
      } else {
        const r = await api<{ category: Category }>(`/api/me/shops/${id}/categories`, { body });
        setCats([...cats, r.category]);
      }
      setEdit(null);
      toast("Категория сохранена");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const reorder = async (i: number, d: number) => {
    const next = [...cats];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setCats(next);
    await api(`/api/me/shops/${id}/categories/reorder`, { body: { ids: next.map((c) => c.id) } }).catch((e) => toast(e.message, "err"));
  };

  const remove = async (c: Category) => {
    const n = count(c.id);
    if (!(await confirm(`Удалить категорию «${c.name}»?${n ? ` ${n} товаров останутся без категории.` : ""}`, { danger: true, ok: "Удалить" }))) return;
    try {
      await api(`/api/me/categories/${c.id}`, { method: "DELETE" });
      setData({ ...data, categories: cats.filter((x) => x.id !== c.id), products: data.products.map((p) => (p.categoryId === c.id ? { ...p, categoryId: null } : p)) });
      toast("Категория удалена");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <PanelShell back={`/panel/shop/${id}`} title={`Категории · ${data.shop.name}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-400">Порядок категорий = порядок на сайте</p>
        <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ name: "", icon: "Tag", image: null, description: "" })}>
          Создать категорию
        </Button>
      </div>
      {cats.length === 0 ? (
        <Empty icon={<FolderTree className="h-7 w-7" />} title="Нет категорий" text="Категории помогают покупателям быстро найти нужное." />
      ) : (
        <div className="space-y-2">
          {cats.map((c, i) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gold/10 text-gold">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${c.image}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name={c.icon} className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="text-xs text-ink-400">
                  {count(c.id)} товаров · /catalog/{c.slug}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => reorder(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink-100 disabled:opacity-30" aria-label="Выше">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" disabled={i === cats.length - 1} onClick={() => reorder(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink-100 disabled:opacity-30" aria-label="Ниже">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setEdit({ ...c })} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink-100" aria-label="Редактировать">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg text-red-300/70 hover:text-red-300" aria-label="Удалить">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Категория" : "Новая категория"}
        footer={
          <>
            <Button className="flex-1" onClick={() => setEdit(null)}>
              Отмена
            </Button>
            <Button className="flex-1" variant="gold" loading={saving} onClick={save}>
              Сохранить
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <Field label="Название">
                <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={80} autoFocus />
              </Field>
              <IconPicker value={edit.icon} onChange={(v) => setEdit({ ...edit, icon: v })} />
            </div>
            <Field label="Описание (показывается на странице категории)">
              <TextArea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <ImageInput label="Картинка вместо иконки (необязательно)" value={edit.image} onChange={(v) => setEdit({ ...edit, image: v })} shopId={Number(id)} aspect="aspect-[2/1]" />
          </div>
        )}
      </Modal>
    </PanelShell>
  );
}
