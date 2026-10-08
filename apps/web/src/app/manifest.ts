import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockFlow — Inventory & Order Management",
    short_name: "StockFlow",
    description: "Stock, orders, purchasing and finance in one place.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f7fb",
    theme_color: "#5b4bdb",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
