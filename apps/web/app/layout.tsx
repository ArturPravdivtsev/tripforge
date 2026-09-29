import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "@/components/providers/query-provider";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TripForge",
    template: "%s | TripForge",
  },
  description: "Collaborative travel planner",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
