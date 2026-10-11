import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { THEME_KEYS } from "@/lib/orkut";

export const metadata: Metadata = {
  title: "orkut — connect with friends",
  description: "An homage to Google's classic 2004 social network. Profiles, scraps, testimonials, communities.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The chosen theme rides on <html data-theme>, and globals.css restyles the
  // whole shell from four CSS variables, so nothing else has to know about it.
  const user = await getSessionUser();
  const theme = user && THEME_KEYS.includes(user.theme as never) ? user.theme : "orkut";
  return (
    <html lang="en" className="h-full" data-theme={theme}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}