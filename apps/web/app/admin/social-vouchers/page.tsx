'use client';

import { useState } from 'react';
import { mockSocialVouchers } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminSocialVouchersPage() {
  const [vouchers, setVouchers] = useState(mockSocialVouchers);

  const remove = (code: string) => {
    setVouchers((prev) => prev.filter((v) => v.code !== code));
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Voucher MXH</span>
          <h1>Quản lý voucher mạng xã hội</h1>
        </div>
        <button className="button button-primary">+ Thêm voucher</button>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nền tảng</th>
                <th>Nội dung</th>
                <th>Mã</th>
                <th>Điều kiện</th>
                <th>HSD</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.code}>
                  <td>{v.platform}</td>
                  <td>{v.title} — {v.discount}</td>
                  <td>{v.code}</td>
                  <td>{v.condition}</td>
                  <td>{v.expiry}</td>
                  <td><span className={`badge ${v.status === 'Limited' ? 'badge-warning' : 'badge-success'}`}>{v.status}</span></td>
                  <td>
                    <div className="admin-action-row">
                      <button className="btn-approve">Sửa</button>
                      <button className="btn-reject" onClick={() => remove(v.code)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">Không còn voucher nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — Xóa cập nhật client-side, chưa nối API voucher MXH thật.</p>
    </AdminShell>
  );
}
