import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import BottomNavBar from "./components/BottomNavBar";
import SessionProvider from "./components/SessionProvider";
import { AuthLoadingOverlay } from "./components/AuthLoadingOverlay";
import { SITE_CONFIG } from "./config/siteConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: SITE_CONFIG.name,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: `${SITE_CONFIG.description} ${SITE_CONFIG.name}에서 시작하세요.`,
  metadataBase: new URL(SITE_CONFIG.url),
  openGraph: {
    type: 'website',
    locale: SITE_CONFIG.locale,
    siteName: SITE_CONFIG.name,
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_CONFIG.name,
    description: SITE_CONFIG.description,
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: 'aS0wYGCo4WvVRFt4PNL7sqOGZqUWYYJGFwRoKwxaNc0',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
              },
              success: {
                iconTheme: {
                  primary: '#34d399',
                  secondary: '#0f172a',
                },
              },
              error: {
                iconTheme: {
                  primary: '#f87171',
                  secondary: '#0f172a',
                },
              },
            }}
          />
          <AuthLoadingOverlay />
          <main>{children}</main>
          <BottomNavBar />
        </SessionProvider>
      </body>
    </html>
  );
}
