import "./globals.css";

export const metadata = {
  title: "Inspiration Library",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
