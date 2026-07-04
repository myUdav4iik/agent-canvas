import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/ui/Providers";
import { indexVault, watchVault } from "@agent-company/engine";
import { prisma } from "@/lib/db";

// Vault indexer runs once on server startup (server component)
// Fire-and-forget — failures don't break the app
if (typeof window === "undefined") {
  indexVault(prisma as unknown as Parameters<typeof indexVault>[0]).catch(console.warn);
  watchVault(prisma as unknown as Parameters<typeof watchVault>[0]);
}

export const metadata: Metadata = {
  title: "Agent Company",
  description: "Visual AI agent workflow designer and runner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080d18] text-[#e2e8f4] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
