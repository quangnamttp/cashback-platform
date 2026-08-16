import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cashback Platform',
  description: 'Multi-marketplace affiliate cashback platform for Shopee, TikTok Shop and Lazada',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
