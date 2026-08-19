import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '../lib/i18n';

export const metadata: Metadata = {
  title: 'Cashback Platform',
  description: 'Multi-marketplace affiliate cashback platform for Shopee, TikTok Shop and Lazada',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
