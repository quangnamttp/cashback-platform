'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AdminShell } from '../../components/layout/AdminShell';
import { getFirebaseDb } from '../../lib/firebase';
import { usePageTitle } from '../../lib/use-page-title';

type FraudSignal = {
  id: string;
  userId: string;
  reason: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
};

const RISK_LABEL: Record<FraudSignal['riskLevel'], string> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

export default function AdminPage() {
  usePageTitle('Tổng quan quản trị');
  const [userCount, setUserCount] = useState(0);
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [pendingPayoutCount, setPendingPayoutCount] = useState(0);
  const [pendingWithdrawalCount, setPendingWithdrawalCount] = useState(0);
  const [recentSignals, setRecentSignals] = useState<FraudSignal[]>([]);

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubscribers = [
      onSnapshot(collection(db, 'users'), (snap) => setUserCount(snap.size)),
      onSnapshot(query(collection(db, 'sessions'), where('status', '==', 'ACTIVE')), (snap) => setActiveSessionCount(snap.size)),
      onSnapshot(query(collection(db, 'orders'), where('status', '==', 'PENDING')), (snap) => setPendingOrderCount(snap.size)),
      // No time gate, no amount tiering — every held entry counts here
      // regardless of size or age (see /manager/payouts).
      onSnapshot(query(collection(db, 'cashbackLedger'), where('status', '==', 'FROZEN')), (snap) => setPendingPayoutCount(snap.size)),
      onSnapshot(query(collection(db, 'withdrawalRequests'), where('status', '==', 'PENDING_ADMIN')), (snap) => setPendingWithdrawalCount(snap.size)),
      onSnapshot(query(collection(db, 'fraudSignals'), where('status', '==', 'OPEN'), orderBy('createdAt', 'desc')), (snap) => {
        setRecentSignals(snap.docs.slice(0, 5).map((d) => ({ id: d.id, ...d.data() }) as FraudSignal));
      }),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const stats = [
    { label: 'Người dùng', value: userCount },
    { label: 'Phiên đang hoạt động', value: activeSessionCount },
    { label: 'Đơn hàng chờ duyệt', value: pendingOrderCount },
    { label: 'Hoàn tiền chờ giải phóng', value: pendingPayoutCount },
    { label: 'Rút tiền chờ duyệt', value: pendingWithdrawalCount },
    { label: 'Cảnh báo gian lận mở', value: recentSignals.length },
  ];

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Tổng quan</span>
          <h1>Tổng quan quản trị</h1>
        </div>
      </div>

      <div className="stats-grid admin-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card compact">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="panel admin-table-panel">
        <div className="panel-header">
          <h3>Cảnh báo gian lận đang mở</h3>
          <span className="badge badge-danger">{recentSignals.length} cảnh báo</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người dùng (uid)</th>
                <th>Lý do</th>
                <th>Mức rủi ro</th>
              </tr>
            </thead>
            <tbody>
              {recentSignals.map((signal) => (
                <tr key={signal.id}>
                  <td>{signal.userId}</td>
                  <td>{signal.reason}</td>
                  <td>
                    <span className={`badge badge-${signal.riskLevel === 'HIGH' ? 'danger' : 'warning'}`}>
                      {RISK_LABEL[signal.riskLevel] ?? signal.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
              {recentSignals.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted-copy">Không có cảnh báo nào đang mở.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Số liệu thật, thời gian thực từ Firestore. Riêng hai trang Tiếp thị liên kết và Giới thiệu bên dưới vẫn đang
        dùng dữ liệu minh họa (mock) — báo mình khi bạn muốn nối nốt sang dữ liệu thật.
      </p>
    </AdminShell>
  );
}
