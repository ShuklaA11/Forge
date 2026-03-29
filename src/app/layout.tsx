import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeadFlow",
  description: "Lead management for modern sales teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <div className="flex h-screen overflow-hidden bg-[#0d0d0d]">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-[#141414] p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
