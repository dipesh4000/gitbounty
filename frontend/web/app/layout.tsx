import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./multi-page.css";
import "./workspace.css";
import "./reward.css";
import { AuthProvider } from "./components/AuthProvider";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "GitBounty — Put a reward on the issues worth closing";
  const description = "Discover open-source issues matched to your skills, contribute through GitHub, and build a visible record from merged work.";

  return {
    metadataBase: baseUrl,
    title,
    description: "Discover open-source issues matched to your skills, ship through GitHub, and build a visible contribution record from merged work.",
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
      shortcut: "/favicon-32.png",
      apple: "/apple-touch-icon.png",
    },
    openGraph: { title, description, type: "website", images: [new URL("/og-image.png", baseUrl)] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og-image.png", baseUrl)] },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
