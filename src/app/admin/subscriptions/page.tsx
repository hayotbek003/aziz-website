"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban, Clock3, Gift, Infinity as InfinityIcon } from "lucide-react";
import { AuthGate } from "@/components/panel/auth";
import { PanelShell } from "@/components/panel/Shell";
import { Button, Card, TextInput, useUi } from "@/components/panel/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ShopSummary } from "@/lib/types";

type History = { id:number; action:string; days:number|null; expires_at:string|null; reason:string; created_at:string; admin:string|null };
const labels: Record<string,string> = { extend:"Бесплатное продление", set_expiry:"Установка даты", lifetime:"Бессрочный доступ", revoke:"Отзыв доступа" };
function SubscriptionAdmin() {
 const {toast,confirm}=useUi(); const [shops,setShops]=useState<ShopSummary[]>([]); const [q,setQ]=useState("");
 const [busy,setBusy]=useState<number|null>(null); const [selected,setSelected]=useState<number|null>(null);
 const [history,setHistory]=useState<History[]>([]); const [days,setDays]=useState("30"); const [date,setDate]=useState(""); const [reason,setReason]=useState("");
 const load=useCallback(async()=>{try{await api<{allowed:boolean}>("/api/admin/subscription-access");const r=await api<{shops:ShopSummary[]}>("/api/admin/shops?q="+encodeURIComponent(q));setShops(r.shops);}catch(e){setShops([]);toast((e as Error).message,"err");}},[q,toast]);
 useEffect(()=>{const t=setTimeout(load,250);return()=>clearTimeout(t);},[load]);
 const loadHistory=async(id:number)=>{setSelected(id);try{const r=await api<{history:History[]}>("/api/admin/shops/"+id+"/subscription/history");setHistory(r.history);}catch(e){toast((e as Error).message,"err");}};
 const apply=async(id:number,action:string,n?:number,expiry?:string)=>{if(action==="revoke"&&!(await confirm("Отозвать доступ? Магазин станет недоступен.",{danger:true,ok:"Отозвать"})))return;setBusy(id);try{await api("/api/admin/shops/"+id+"/subscription",{body:{action,days:n,expires_at:expiry,reason,notify_owner:true}});toast("Подписка обновлена без создания платежа");setReason("");await load();await loadHistory(id);}catch(e){toast((e as Error).message,"err");}finally{setBusy(null);}};
 return <PanelShell title="Ручные подписки" back="/admin" wide>
 <div className="mb-4 rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm">Бесплатное управление доступом. Действия не создают платежи и сохраняются в журнале.</div>
 <div className="mb-4"><TextInput value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск магазина или владельца"/></div>
 <div className="grid gap-3 lg:grid-cols-2"><div className="space-y-2">{shops.map(s=><Card key={s.id} className="p-3">
 <div className="flex items-start justify-between gap-2"><div><b>{s.name}</b><div className="text-xs text-ink-400">#{s.id} · /shop/{s.slug} · {s.owner?.username?"@"+s.owner.username:s.owner?.telegram_id}</div><div className="text-xs text-ink-400">Статус: {s.status.state} · до {s.paid_until&&new Date(s.paid_until).getUTCFullYear()>9900?"Бессрочно":formatDate(s.status.expires_at)}</div></div><Button size="sm" variant="gold" onClick={()=>loadHistory(s.id)}>История</Button></div>
 <div className="mt-3 flex flex-wrap gap-1.5">{[7,30,90,180,365].map(d=><Button key={d} size="sm" loading={busy===s.id} onClick={()=>apply(s.id,"extend",d)}><Gift className="mr-1 h-3.5 w-3.5"/>+{d} дн.</Button>)}<Button size="sm" loading={busy===s.id} onClick={()=>apply(s.id,"lifetime")}><InfinityIcon className="mr-1 h-3.5 w-3.5"/>Навсегда</Button><Button size="sm" variant="danger" loading={busy===s.id} onClick={()=>apply(s.id,"revoke")}><Ban className="mr-1 h-3.5 w-3.5"/>Отозвать</Button></div>
 <div className="mt-3 grid gap-2 sm:grid-cols-[100px_1fr_auto]"><TextInput type="number" min="1" max="36500" value={days} onChange={e=>setDays(e.target.value)} placeholder="Дней"/><TextInput value={reason} onChange={e=>setReason(e.target.value)} placeholder="Причина (необязательно)"/><Button size="sm" disabled={!Number.isInteger(Number(days))||Number(days)<1||Number(days)>36500} onClick={()=>apply(s.id,"extend",Number(days))}>Продлить</Button></div>
 <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><TextInput type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><Button size="sm" disabled={!date} onClick={()=>apply(s.id,"set_expiry",undefined,new Date(date).toISOString())}>Установить дату</Button></div>
 </Card>)}</div>
 <Card className="h-fit p-4"><h2 className="mb-3 flex items-center gap-2 font-bold"><Clock3 className="h-4 w-4 text-gold"/>История подписки {selected?"#"+selected:""}</h2>{!selected?<p className="text-sm text-ink-400">Выбери магазин и нажми «История».</p>:history.length===0?<p className="text-sm text-ink-400">История пока пустая.</p>:history.map(h=><div key={h.id} className="border-b border-white/5 py-3 text-sm"><b>{labels[h.action]||h.action}{h.days?" · "+h.days+" дней":""}</b><div className="text-xs text-ink-400">{formatDate(h.created_at)} · {h.admin||"Администратор"} · до {h.expires_at?formatDate(h.expires_at):"—"}</div>{h.reason&&<p className="mt-1 text-xs">{h.reason}</p>}</div>)}</Card></div>
 </PanelShell>;
}
export default function AdminSubscriptionsPage(){return <AuthGate requireAdmin><SubscriptionAdmin/></AuthGate>;}
