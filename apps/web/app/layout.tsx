import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';
import { AuthProvider } from '../lib/auth';
import { PwaInstallProvider } from '../lib/pwaInstall';
import { BackToTop } from '../components/ui/BackToTop';

// Be Vietnam Pro — built specifically for Vietnamese diacritics (sharper
// hinting than a generic system-font stack) while still reading as a
// modern, thin-stroke sans, matching what other VN cashback sites use.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hoàn Tiền DV',
  description: 'Multi-marketplace affiliate cashback platform for Shopee, TikTok Shop and Lazada',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0096ff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <PwaInstallProvider>
              <AuthProvider>{children}</AuthProvider>
              <BackToTop />
            </PwaInstallProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
