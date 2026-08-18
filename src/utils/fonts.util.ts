import { Geist, Geist_Mono } from "next/font/google";

// import localFont from "next/font/local";

// --- Google Fonts ---
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// --- Local Fonts (Commented out examples) ---
/*
const myLocalFont = localFont({
  src: "./fonts/my-font.woff2",
  variable: "--font-local",
  display: "swap",
});
*/

export function useFonts() {
  const fonts = [
    geist.variable,
    geistMono.variable,
    // myLocalFont.variable,
  ];

  return fonts.join(" ");
}
