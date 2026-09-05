import { Figtree, Lalezar } from "next/font/google";
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

// The interface face, everything but the wordmark. Self-hosted for the same
// reasons, and a variable font rather than a set of static weights: the app
// asks for 400, 500 and 600, and one variable file covers all three for less
// than two static ones would cost.
const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
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
    <html lang="en" className={`${lalezar.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
