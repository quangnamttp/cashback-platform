'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Voucher MXH was merged into /get-cashback-link (see phần "gộp Voucher vào
// trang Hoàn tiền") — this route stays only to gracefully forward any old
// bookmarks/links instead of 404ing.
export default function SocialVouchersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/get-cashback-link');
  }, [router]);
  return null;
}
