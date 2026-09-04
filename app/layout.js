import { Lalezar } from "next/font/google";
import "./globals.css";
import { themeBootScript } from "@/lib/theme";

// The wordmark face, self-hosted by next/font rather than fetched from Google
// at runtime: no third-party request on every page load, and no flash of a
// fallback face swapping under the logo. Lalezar ships a single weight.
const lalezar = Lalezar({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-wordmark",
});

export const metadata = {
  title: "Kivli",
  description: "Your visual inspiration library",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-theme on this
    // element before React hydrates, so the attribute is legitimately absent
    // from the server HTML. It's scoped to this element's own attributes.
    <html lang="en" className={lalezar.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
