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

// The dashboard headline, and nothing else. Setting the whole interface in
// Figtree made the app feel like a brochure for itself; at 44px on one line of
// copy it does the job the system stack can't, which is to have a voice.
//
// Two weights, both real cuts. The headline is set in 800, and asking for it
// while loading only 600 would have the browser fake the bold by smearing the
// 600 -- which is exactly the thing a display face is chosen to avoid.
const figtree = Figtree({
  weight: ["600", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
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
