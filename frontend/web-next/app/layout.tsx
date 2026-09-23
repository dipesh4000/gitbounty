import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* The same three families the static site loaded from Google Fonts, but self-hosted by next/font so there is no
   render-blocking request and no flash of fallback text. globals.css points --font-display / --font-body /
   --font-mono at these variables; nothing else in the stylesheet changed. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GitBounty",
  description:
    "Maintainers attach a bounty to any GitHub issue. Contributors merge a fix and get paid straight to their wallet.",
  icons: { icon: "/assets/logo_mark.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
