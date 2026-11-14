"use client";
import { useEffect, useRef } from "react";
import { themeStyle } from "@/lib/theme";
import type { StoreData } from "@/lib/types";
import { StoreProvider, useStore, type StoreMode } from "./context";
import { BottomNav, Footer, Header } from "./parts";
import {
  AboutPage, CatalogPage, ContactsPage, DeliveryPage, FaqPage, FavoritesPage, HomePage, NotFound, ProductPage,
} from "./pages";

function Router() {
  const { path } = useStore();
  const seg = path.split("?")[0].split("/").filter(Boolean);
  switch (seg[0]) {
    case undefined:
      return <HomePage />;
    case "catalog":
      return <CatalogPage key={seg[1] || "all"} categorySlug={seg[1] ? decodeURIComponent(seg[1]) : undefined} />;
    case "product":
      return <ProductPage id={seg[1] || ""} />;
    case "about":
      return <AboutPage />;
    case "contacts":
      return <ContactsPage />;
    case "delivery":
      return <DeliveryPage />;
    case "faq":
      return <FaqPage />;
    case "favorites":
      return <FavoritesPage />;
    default:
      return <NotFound />;
  }
}

function ScrollTop({ path, rootRef }: { path: string; rootRef: React.RefObject<HTMLDivElement> }) {
  useEffect(() => {
    const scroller = rootRef.current?.closest("[data-scroll-root]");
    if (scroller) scroller.scrollTo({ top: 0 });
  }, [path, rootRef]);
  return null;
}

export default function Storefront({
  data,
  mode,
  onTrack,
  banner,
}: {
  data: StoreData;
  mode: StoreMode;
  onTrack?: (type: "view" | "product_view" | "order_click", productId?: string | number) => void;
  banner?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = data.config.theme;
  return (
    <StoreProvider data={data} mode={mode} onTrack={onTrack}>
      <div ref={ref} className="store @container relative min-h-full" data-card={theme.cardStyle} style={themeStyle(theme)}>
        <ScrollTop path={mode.path} rootRef={ref} />
        {banner}
        <Header />
        <main className="min-h-[60vh]">
          <Router />
        </main>
        <Footer />
        <BottomNav />
      </div>
    </StoreProvider>
  );
}
