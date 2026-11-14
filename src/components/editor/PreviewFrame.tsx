"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * Масштабируемая «рамка устройства» для живого предпросмотра.
 * Витрина рендерится в виртуальной ширине (телефон 390px / ПК 1280px) — container queries дают
 * ту же адаптивную вёрстку, что и на реальном устройстве. transform делает рамку containing block
 * для fixed-элементов (нижняя навигация, меню).
 */
export function PreviewFrame({ width, children, className, interactive = true }: { width: number; children: ReactNode; className?: string; interactive?: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const scale = size.w ? Math.min(1, size.w / width) : 1;
  return (
    <div ref={outer} className={cx("relative overflow-hidden", className)}>
      {size.w > 0 && (
        <div
          className="preview-frame absolute left-0 top-0 origin-top-left"
          style={{ width, height: size.h / scale, transform: `scale(${scale})`, pointerEvents: interactive ? "auto" : "none" }}
        >
          <div data-scroll-root className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ленивая отрисовка: тяжёлые превью рендерятся только когда видны на экране. */
export function LazyVisible({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) {
        setShow(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {show ? children : null}
    </div>
  );
}
