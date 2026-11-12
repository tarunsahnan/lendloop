import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

/** Member pages are private, so search engines are asked not to index them. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MemberLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
