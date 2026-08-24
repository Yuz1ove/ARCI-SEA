import type { Metadata } from 'next';
import { ScenarioStateProvider } from '@/components/ScenarioStateProvider';
import './globals.css';
import './brand-overrides.css';

const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(vercelHost ? `https://${vercelHost}` : 'http://localhost:3000'),
  title: 'ARCI — 自主韌性電商營運決策',
  description: 'ARCI 台灣電商物流數位孿生與自主決策閉環競賽展示。',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'ARCI — 自主韌性電商營運決策',
    description: '從異常偵測、調度執行到結果驗證與持續重新規劃。',
    images: [{ url: '/og.png', width: 1730, height: 910, alt: 'ARCI autonomous commerce recovery network' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARCI — 自主韌性電商營運決策',
    description: '從異常偵測、調度執行到結果驗證與持續重新規劃。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant"><body><ScenarioStateProvider>{children}</ScenarioStateProvider></body></html>
  );
}
