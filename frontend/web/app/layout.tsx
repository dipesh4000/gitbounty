import type { Metadata } from "next";
import { headers } from "next/headers";
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

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "GitBounty — Find the issue. Ship the fix. Earn the signal.";
  const description = "Discover open-source issues matched to your skills, contribute through GitHub, and build a visible record from merged work.";

  return {
    metadataBase: baseUrl,
    title,
    description: "Discover open-source issues matched to your skills, ship through GitHub, and build a visible contribution record from merged work.",
    icons: { icon: "/assets/logo_mark.svg" },
    openGraph: { title, description, type: "website", images: [new URL("/og-broadsheet.jpg", baseUrl)] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og-broadsheet.jpg", baseUrl)] },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <span
          hidden
          dangerouslySetInnerHTML={{
            __html: "<!-- open-source-ledger / pinned-brief / unreviewed-and-undocumented-is-unfinished -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
