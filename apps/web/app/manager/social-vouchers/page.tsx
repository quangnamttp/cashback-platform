'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Voucher management was merged into /manager/affiliate (see phần "Gom
// phần quản lý voucher mạng xã hội về chung một mối với khu vực quản lý
// hoàn tiền/link") — this route stays only to gracefully forward any old
// bookmarks/links instead of 404ing.
export default function AdminSocialVouchersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manager/affiliate');
  }, [router]);
  return null;
}
