'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { getFirebaseDb } from '../../../lib/firebase';
import { usePageTitle } from '../../../lib/use-page-title';

type LedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  type: 'CUSTOMER_CASHBACK' | 'REFERRAL_BONUS' | 'PLATFORM_REVENUE';
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
};

// Admin transfers their own 20% revenue out directly (own banking app),
// not through the same request → approve → pay pipeline built for
// customers — approving your own request is just formality theater when
// it's your own money. This page is now read-only stats: live totals from
// cashbackLedger, nothing to create or track here anymore.
export default function AdminWalletPage() {
  usePageTitle('Ví tổng Admin');
  const { lang } = useLanguage();

  const [allLedger, setAllLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    const db = getFirebaseDb();
    // Admin can read the whole ledger (see firestore.rules) — used to
    // derive the platform revenue stats below.
    const unsubLedger = onSnapshot(collection(db, 'cashbackLedger'), (snap) => {
      setAllLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    return unsubLedger;
  }, []);

  const stats = useMemo(() => {
    let platformReleased = 0;
    let platformFrozen = 0;
    let customerReleased = 0;
    let referralReleased = 0;
    allLedger.forEach((entry) => {
      if (entry.type === 'PLATFORM_REVENUE') {
        if (entry.status === 'RELEASED') platformReleased += entry.amount;
        else if (entry.status === 'FROZEN') platformFrozen += entry.amount;
      } else if (entry.type === 'CUSTOMER_CASHBACK' && entry.status === 'RELEASED') {
        customerReleased += entry.amount;
      } else if (entry.type === 'REFERRAL_BONUS' && entry.status === 'RELEASED') {
        referralReleased += entry.amount;
      }
    });
    return {
      released: platformReleased,
      frozen: platformFrozen,
      lifetimeRevenue: platformReleased + platformFrozen,
      customerReleased,
      referralReleased,
    };
  }, [allLedger]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Ví tổng Admin</span>
          <h1>Doanh thu 20%</h1>
        </div>
      </div>

      <div className="stats-grid admin-grid">
        <div className="stat-card compact">
          <div className="stat-label">Doanh thu đã giải phóng</div>
          <div className="stat-value">{formatCurrency(stats.released, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đang chờ giải phóng</div>
          <div className="stat-value">{formatCurrency(stats.frozen, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Doanh thu 20% lũy kế</div>
          <div className="stat-value">{formatCurrency(stats.lifetimeRevenue, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đã trả khách hàng (cashback)</div>
          <div className="stat-value">{formatCurrency(stats.customerReleased, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đã trả người giới thiệu</div>
          <div className="stat-value">{formatCurrency(stats.referralReleased, lang)}</div>
        </div>
      </div>

      <p className="mock-note">
        Doanh thu 20% được tính trực tiếp từ <code>cashbackLedger</code> (khoản loại <code>PLATFORM_REVENUE</code>, chủ
        sở hữu ảo <code>ADMIN_WALLET</code>) — không dùng biến đếm số dư nào cả, nên luôn khớp với thực tế dù mở nhiều
        tab cùng lúc. Trang này chỉ hiển thị số liệu tham khảo: Admin tự chuyển khoản doanh thu qua app ngân hàng riêng
        khi cần, không cần tạo lệnh rút hay đi qua quy trình duyệt dành cho khách hàng.
      </p>
    </AdminShell>
  );
}
