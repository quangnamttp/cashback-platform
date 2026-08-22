import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';

export const metadata: Metadata = {
  title: 'Cashback Platform',
  description: 'Multi-marketplace affiliate cashback platform for Shopee, TikTok Shop and Lazada',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
