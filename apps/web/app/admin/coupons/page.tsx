'use client';

import { useState } from 'react';
import { mockCoupons } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState(mockCoupons);

  const remove = (code: string) => {
    setCoupons((prev) => prev.filter((c) => c.code !== code));
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Coupon</span>
          <h1>Quản lý coupon</h1>
        </div>
        <button className="button button-primary">+ Thêm coupon</button>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sàn</th>
                <th>Mã</th>
                <th>Ưu đãi</th>
                <th>Đơn tối thiểu</th>
                <th>HSD</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.code}>
                  <td>{coupon.marketplace}</td>
                  <td>{coupon.code}</td>
                  <td>{coupon.discount}</td>
                  <td>{coupon.minOrder}</td>
                  <td>{coupon.expiry}</td>
                  <td><span className={`badge ${coupon.status === 'Ending soon' ? 'badge-warning' : 'badge-success'}`}>{coupon.status}</span></td>
                  <td>
                    <div className="admin-action-row">
                      <button className="btn-approve">Sửa</button>
                      <button className="btn-reject" onClick={() => remove(coupon.code)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">Không còn coupon nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — Xóa cập nhật client-side, chưa nối API coupon thật.</p>
    </AdminShell>
  );
}
