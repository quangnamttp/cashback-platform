'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { ADMIN_WALLET_ID } from '../../../lib/orderEntry';
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

type WithdrawalRow = { userId: string; amount: number; status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'PAID' };

// Admin transfers their own 20% revenue out directly (own banking app),
// not through the same request → approve → pay pipeline built for
// customers — approving your own request is just formality theater when
// it's your own money. This page is now read-only stats: live totals from
// cashbackLedger, nothing to create or track here anymore.
export default function AdminWalletPage() {
  usePageTitle('Ví tổng Admin');
  const { lang } = useLanguage();

  const [allLedger, setAllLedger] = useState<LedgerEntry[]>([]);
  const [allWithdrawals, setAllWithdrawals] = useState<WithdrawalRow[]>([]);

  useEffect(() => {
    const db = getFirebaseDb();
    // Admin can read the whole ledger (see firestore.rules) — used to
    // derive the platform revenue stats below.
    const unsubLedger = onSnapshot(collection(db, 'cashbackLedger'), (snap) => {
      setAllLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    const unsubWithdrawals = onSnapshot(collection(db, 'withdrawalRequests'), (snap) => {
      setAllWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRow));
    });
    return () => {
      unsubLedger();
      unsubWithdrawals();
    };
  }, []);

  // Two clearly separate things on purpose (never summed together into one
  // number): the ADMIN's own 20% revenue (platform*) vs a system-wide
  // reconciliation view of CUSTOMER money moving through the platform
  // (customer*/referral*/systemLiability) — this page is the one place an
  // aggregate view of both is appropriate (nothing here is presented as any
  // one customer's own wallet), but they stay in separate stat cards with
  // distinct labels so "doanh thu Admin" is never confused with "tiền của
  // khách đang giữ trong hệ thống".
  const stats = useMemo(() => {
    let platformReleased = 0;
    let platformFrozen = 0;
    let customerReleased = 0;
    let referralReleased = 0;
    let customerRejected = 0;
    allLedger.forEach((entry) => {
      if (entry.type === 'PLATFORM_REVENUE') {
        if (entry.status === 'RELEASED') platformReleased += entry.amount;
        else if (entry.status === 'FROZEN') platformFrozen += entry.amount;
        return;
      }
      // CUSTOMER_CASHBACK + REFERRAL_BONUS together — both are real money
      // owed to a customer (the referrer IS a customer too), as opposed to
      // PLATFORM_REVENUE which is the admin's own share.
      if (entry.status === 'RELEASED') {
        if (entry.type === 'CUSTOMER_CASHBACK') customerReleased += entry.amount;
        else referralReleased += entry.amount;
      } else if (entry.status === 'REJECTED') {
        customerRejected += entry.amount;
      }
    });

    // Real money that has actually left the system via a completed payout
    // — PAID only (PENDING_ADMIN/APPROVED are still reserved, not yet
    // transferred). Excludes ADMIN_WALLET's own 20%-revenue withdrawals,
    // which are a separate, admin-only figure (not customer money).
    const customerWithdrawn = allWithdrawals
      .filter((w) => w.status === 'PAID' && w.userId !== ADMIN_WALLET_ID)
      .reduce((sum, w) => sum + w.amount, 0);

    // "Số dư hệ thống": total customer+referral cashback ever RELEASED into
    // a wallet, minus what customers have actually withdrawn — i.e. how
    // much combined customer balance is still sitting inside the platform
    // right now. This is a system-wide reconciliation total, not any one
    // customer's own balance — see the page's own note below.
    const systemLiability = customerReleased + referralReleased - customerWithdrawn;

    return {
      released: platformReleased,
      frozen: platformFrozen,
      lifetimeRevenue: platformReleased + platformFrozen,
      customerReleased,
      referralReleased,
      customerRejected,
      customerWithdrawn,
      systemLiability,
    };
  }, [allLedger, allWithdrawals]);

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

      <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: '0.95rem' }}>Tổng quan tài chính toàn hệ thống</h3>
      <div className="stats-grid admin-grid">
        <div className="stat-card compact">
          <div className="stat-label">Cashback khách hàng bị từ chối</div>
          <div className="stat-value">{formatCurrency(stats.customerRejected, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Khách hàng đã rút (đã chuyển khoản)</div>
          <div className="stat-value">{formatCurrency(stats.customerWithdrawn, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Số dư hệ thống (khách chưa rút)</div>
          <div className="stat-value">{formatCurrency(stats.systemLiability, lang)}</div>
        </div>
      </div>

      <p className="mock-note">
        Doanh thu 20% được tính trực tiếp từ <code>cashbackLedger</code> (khoản loại <code>PLATFORM_REVENUE</code>, chủ
        sở hữu ảo <code>ADMIN_WALLET</code>) — không dùng biến đếm số dư nào cả, nên luôn khớp với thực tế dù mở nhiều
        tab cùng lúc. Trang này chỉ hiển thị số liệu tham khảo: Admin tự chuyển khoản doanh thu qua app ngân hàng riêng
        khi cần, không cần tạo lệnh rút hay đi qua quy trình duyệt dành cho khách hàng.
        <br />
        <strong>Tổng quan tài chính toàn hệ thống</strong> ở dưới là số liệu tổng hợp <em>toàn bộ khách hàng cộng lại</em>
        — hoàn toàn tách biệt với doanh thu 20% của Admin phía trên, và không phải số dư ví cá nhân của bất kỳ khách
        nào. &quot;Số dư hệ thống&quot; = tổng cashback (khách hàng + người giới thiệu) đã giải phóng, trừ đi số tiền
        khách đã thực rút — tức tổng số dư khả dụng cộng dồn hiện còn nằm trong toàn hệ thống, chưa ai rút ra.
      </p>
    </AdminShell>
  );
}
