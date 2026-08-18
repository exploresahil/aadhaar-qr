import ReactLenis from "lenis/react";
import "./scss/globals.scss";
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
};

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactLenis root>
      <main className="main">{children}</main>
    </ReactLenis>
  );
}
