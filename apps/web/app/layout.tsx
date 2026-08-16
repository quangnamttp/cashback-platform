import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cashback Platform',
  description: 'Multi-marketplace affiliate cashback platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
