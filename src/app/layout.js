import "./globals.css";

import { Inter } from "next/font/google";
import Providers from "./provider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zenigram",
});

export const metadata = {
  title: {
    default: "Zenigram — Share Your World",
    template: "%s | Zenigram",
  },
  description:
    "Zenigram is a modern social space for stories, posts, conversations, creators, and the world around you.",
  applicationName: "Zenigram",
  keywords: [
    "Zenigram",
    "social media",
    "stories",
    "global stories",
    "social network",
    "messaging",
    "creator community",
  ],
  icons: {
    icon: "/zenigram_logo.jpeg",
    apple: "/zenigram_logo.jpeg",
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:7860",
  ),
  openGraph: {
    type: "website",
    siteName: "Zenigram",
    title: "Zenigram — Share Your World",
    description:
      "Stories, posts, conversations, and global moments in one place.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zenigram — Share Your World",
    description:
      "Stories, posts, conversations, and global moments in one place.",
  },
};

export const viewport = {
  themeColor: "#08090d",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen antialiased`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>
          <div id="main-content">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
