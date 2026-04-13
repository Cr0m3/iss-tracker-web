import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISS Tracker",
  description:
    "Real-time International Space Station tracking with live map, crew info and pass predictions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
