import "./globals.css";

import Providers from "./provider";

export const metadata = {
  title: {
    default: "Zenigram",
    template: "%s | Zenigram",
  },
  icons: {
    icon: "/zenigram_logo.jpeg",
    apple: "/zenigram_logo.jpeg",
  },
  description:
    "Connecting the world through stories, posts, and conversations.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
