"use client";
import { AuthGate } from "@/components/panel/auth";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
