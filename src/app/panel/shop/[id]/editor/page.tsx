"use client";
import { useParams } from "next/navigation";
import Editor, { EditorLoading } from "@/components/editor/Editor";
import { useShop } from "@/components/panel/useShop";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useShop(id);
  if (error) return <div className="grid h-dvh place-items-center text-red-300">{error}</div>;
  if (!data) return <EditorLoading />;
  return <Editor initial={data} />;
}
