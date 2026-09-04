import "./globals.css";
import { themeBootScript } from "@/lib/theme";

export const metadata = {
  title: "Inspiration Library",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-theme on this
    // element before React hydrates, so the attribute is legitimately absent
    // from the server HTML. It's scoped to this element's own attributes.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
