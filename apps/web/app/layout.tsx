import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';
import { AuthProvider } from '../lib/auth';
import { PwaInstallProvider } from '../lib/pwaInstall';
import { BackToTop } from '../components/ui/BackToTop';
import { AppLoadingScreen } from '../components/ui/AppLoadingScreen';

// Be Vietnam Pro — built specifically for Vietnamese diacritics (sharper
// hinting than a generic system-font stack) while still reading as a
// modern, thin-stroke sans, matching what other VN cashback sites use.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = 'https://hoantiendv.web.app';
const SITE_NAME = 'Hoàn Tiền DV';
const SITE_DESCRIPTION = 'Nền tảng hoàn tiền / hoa hồng tiếp thị cho Shopee, TikTok Shop và Lazada';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  // Required for Next.js to resolve the relative image path below into an
  // absolute URL in the actual static HTML output — OG scrapers
  // (Facebook/Messenger/Zalo/Telegram) generally won't follow a relative
  // og:image URL, only an absolute one.
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    // Reuses the existing brand logo (public/logo.png, already used
    // everywhere else — see components/ui/BrandMark.tsx) rather than a
    // separate purpose-made OG asset — square 500x500 renders fine as a
    // link-preview image on every platform this was asked for (Facebook,
    // Messenger, Zalo, Telegram).
    images: [{ url: '/logo.png', width: 500, height: 500, alt: SITE_NAME }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    // 'summary' (not 'summary_large_image') matches a square image's real
    // aspect ratio — the large-image card assumes ~1200x630 and would
    // crop a square logo oddly.
    card: 'summary',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/logo.png'],
  },
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
        <AppLoadingScreen />
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
