'use client';

import { useState } from 'react';
import { mockSocialVouchers } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { usePageTitle } from '../../../lib/use-page-title';

type Voucher = (typeof mockSocialVouchers)[number];

const emptyForm: Voucher = {
  platform: 'Facebook',
  title: '',
  code: '',
  discount: '',
  condition: '',
  source: '',
  expiry: '',
  status: 'Valid',
  usedPercent: 0,
};

export default function AdminSocialVouchersPage() {
  usePageTitle('Quản lý voucher mạng xã hội');
  const [vouchers, setVouchers] = useState(mockSocialVouchers);
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<Voucher>(emptyForm);

  const remove = (code: string) => {
    setVouchers((prev) => prev.filter((v) => v.code !== code));
  };

  const openAdd = () => {
    setEditingCode(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (v: Voucher) => {
    setEditingCode(v.code);
    setForm(v);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.title || !form.code) return;
    if (editingCode) {
      setVouchers((prev) => prev.map((v) => (v.code === editingCode ? form : v)));
    } else {
      setVouchers((prev) => [form, ...prev]);
    }
    setShowForm(false);
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Voucher MXH</span>
          <h1>Quản lý voucher mạng xã hội</h1>
        </div>
        <button className="button button-primary" onClick={openAdd}>+ Thêm voucher</button>
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
                      <button className="btn-approve" onClick={() => openEdit(v)}>Sửa</button>
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

      <p className="mock-note">Dữ liệu minh họa (mock) — Thêm/Sửa/Xóa cập nhật client-side, chưa nối API voucher MXH thật.</p>

      <Modal open={showForm} onClose={() => setShowForm(false)}>
        <h3 style={{ marginTop: 0 }}>{editingCode ? 'Sửa voucher' : 'Thêm voucher mới'}</h3>
        <div className="bank-add-form">
          <label>
            <span className="field-label">Nền tảng</span>
            <select className="wd-bank-select" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="Facebook">Facebook</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube</option>
            </select>
          </label>
          <div className="field-group-row">
            <label>
              <span className="field-label">Tiêu đề</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>
              <span className="field-label">Giảm giá</span>
              <input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} placeholder="Giảm ₫30K" />
            </label>
          </div>
          <div className="field-group-row">
            <label>
              <span className="field-label">Mã voucher</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </label>
            <label>
              <span className="field-label">HSD</span>
              <input value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} placeholder="30/08/2026" />
            </label>
          </div>
          <label>
            <span className="field-label">Điều kiện</span>
            <input value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} placeholder="Đơn từ ₫150K" />
          </label>
          <label>
            <span className="field-label">Trạng thái</span>
            <select className="wd-bank-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Valid">Valid</option>
              <option value="Limited">Limited</option>
            </select>
          </label>
          <button className="button button-primary" onClick={handleSave} disabled={!form.title || !form.code}>
            {editingCode ? 'Lưu thay đổi' : 'Thêm voucher'}
          </button>
        </div>
      </Modal>
    </AdminShell>
  );
}
