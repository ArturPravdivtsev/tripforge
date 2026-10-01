import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { QueryProvider } from "@/components/providers/query-provider";

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

export default async function RootLayout({ children }: RootLayoutProps) {
  // Opt into request rendering so Next can apply the per-request CSP nonce.
  await headers();

  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
