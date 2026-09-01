'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { mockPlatforms } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { SOCIAL_PLATFORMS, SocialPlatformIcon, type SocialPlatform } from '../../../components/ui/SocialPlatformIcons';
import { MARKETPLACE_OPTIONS, type Platform } from '../../../lib/redirectLink';
import { usePageTitle } from '../../../lib/use-page-title';

const VOUCHER_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả nền tảng' },
  ...SOCIAL_PLATFORMS.map((p) => ({ value: p, label: p })),
];

type Voucher = {
  id: string;
  platform: string;
  title: string;
  code: string;
  discount: string;
  condition: string;
  source: string;
  expiry: string;
  status: string;
  usedPercent: number;
  /** Which marketplace(s) this code can be used on — empty/undefined means
   * universal (applies everywhere), which also keeps every voucher created
   * before this field existed working unchanged. */
  marketplaces?: Platform[];
};

const emptyForm: Omit<Voucher, 'id'> = {
  platform: 'Facebook',
  title: '',
  code: '',
  discount: '',
  condition: '',
  source: '',
  expiry: '',
  status: 'Valid',
  usedPercent: 0,
  marketplaces: [],
};

const MARKETPLACE_CODE_TO_LABEL: Record<Platform, string> = {
  SHOPEE: 'Shopee',
  TIKTOK_SHOP: 'TikTok Shop',
  LAZADA: 'Lazada',
};

const QUICK_ADD_PLACEHOLDER = `Facebook | Săn sale cuối tuần | SALE50K | Giảm 50K | Đơn từ 300K | 30/09/2026 | | SHOPEE,LAZADA
Instagram | Mã giảm giá mỹ phẩm | BEAUTY10 | Giảm 10% | Đơn từ 200K | 15/09/2026`;

function parseQuickAddLine(line: string, index: number): { voucher: Omit<Voucher, 'id'> | null; error: string | null } {
  const raw = line.trim();
  if (!raw) return { voucher: null, error: null };
  const parts = raw.split('|').map((p) => p.trim());
  if (parts.length < 4) {
    return { voucher: null, error: `Dòng ${index + 1}: thiếu cột (cần tối thiểu Nền tảng | Tiêu đề | Mã | Giảm giá).` };
  }
  const [platformRaw, title, code, discount, condition = '', expiry = '', source = '', marketplacesRaw = ''] = parts;
  const platform = SOCIAL_PLATFORMS.find((p) => p.toLowerCase() === platformRaw.toLowerCase());
  if (!platform) {
    return { voucher: null, error: `Dòng ${index + 1}: nền tảng "${platformRaw}" không hợp lệ (chỉ nhận ${SOCIAL_PLATFORMS.join('/')}).` };
  }
  if (!title || !code || !discount) {
    return { voucher: null, error: `Dòng ${index + 1}: thiếu tiêu đề / mã / mức giảm.` };
  }
  const marketplaceTokens = marketplacesRaw.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  const marketplaces: Platform[] = [];
  for (const token of marketplaceTokens) {
    const match = MARKETPLACE_OPTIONS.find((m) => m.value === token || m.label.toUpperCase() === token);
    if (!match) {
      return { voucher: null, error: `Dòng ${index + 1}: sàn "${token}" không hợp lệ (chỉ nhận SHOPEE/TIKTOK_SHOP/LAZADA, để trống = tất cả sàn).` };
    }
    marketplaces.push(match.value);
  }
  return {
    voucher: { platform, title, code: code.toUpperCase(), discount, condition, expiry, source, status: 'Valid', usedPercent: 0, marketplaces },
    error: null,
  };
}

export default function AdminAffiliatePage() {
  usePageTitle('Tiếp thị liên kết & Voucher');
  const [tab, setTab] = useState<'platforms' | 'vouchers'>('vouchers');

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Voucher, 'id'>>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddResult, setQuickAddResult] = useState<{ added: number; errors: string[] } | null>(null);

  const [voucherSearch, setVoucherSearch] = useState('');
  const [voucherPlatformFilter, setVoucherPlatformFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'socialVouchers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setVouchers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Voucher)));
    });
    return unsubscribe;
  }, []);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      if (voucherPlatformFilter !== 'all' && v.platform !== voucherPlatformFilter) return false;
      if (!voucherSearch.trim()) return true;
      const q = voucherSearch.trim().toLowerCase();
      return (
        v.code.toLowerCase().includes(q) ||
        v.title.toLowerCase().includes(q) ||
        v.platform.toLowerCase().includes(q) ||
        (v.source ?? '').toLowerCase().includes(q)
      );
    });
  }, [vouchers, voucherSearch, voucherPlatformFilter]);

  const remove = async (id: string) => {
    try {
      await deleteDoc(doc(getFirebaseDb(), 'socialVouchers', id));
    } catch (err) {
      console.error('delete voucher failed', err);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (v: Voucher) => {
    const { id, ...rest } = v;
    setEditingId(id);
    setForm({ ...rest, marketplaces: rest.marketplaces ?? [] });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.code) return;
    setSaving(true);
    try {
      const db = getFirebaseDb();
      if (editingId) {
        await updateDoc(doc(db, 'socialVouchers', editingId), { ...form });
      } else {
        await addDoc(collection(db, 'socialVouchers'), { ...form, createdAt: new Date() });
      }
      setShowForm(false);
    } catch (err) {
      console.error('save voucher failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async () => {
    const lines = quickAddText.split('\n');
    const parsed = lines.map((line, i) => parseQuickAddLine(line, i));
    const errors = parsed.map((p) => p.error).filter((e): e is string => !!e);
    const toAdd = parsed.map((p) => p.voucher).filter((v): v is Omit<Voucher, 'id'> => !!v);

    if (toAdd.length === 0) {
      setQuickAddResult({ added: 0, errors: errors.length ? errors : ['Chưa có dòng hợp lệ nào để nhập.'] });
      return;
    }

    setQuickAddSaving(true);
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      toAdd.forEach((v) => {
        batch.set(doc(collection(db, 'socialVouchers')), { ...v, createdAt: new Date() });
      });
      await batch.commit();
      setQuickAddResult({ added: toAdd.length, errors });
      setQuickAddText('');
    } catch (err) {
      console.error('quick add vouchers failed', err);
      setQuickAddResult({ added: 0, errors: ['Nhập hàng loạt thất bại, vui lòng thử lại.'] });
    } finally {
      setQuickAddSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Tiếp thị liên kết</span>
          <h1>Tiếp thị liên kết &amp; Voucher</h1>
        </div>
        {tab === 'vouchers' && (
          <div className="admin-action-row">
            <button className="button button-secondary" onClick={() => setShowQuickAdd((v) => !v)}>⚡ Nhập nhanh</button>
            <button className="button button-primary" onClick={openAdd}>+ Thêm voucher</button>
          </div>
        )}
      </div>

      <div className="admin-toolbar" style={{ marginBottom: 4 }}>
        <div className="sv-platform-tabs" style={{ margin: 0 }}>
          <button className={tab === 'vouchers' ? 'active' : ''} onClick={() => setTab('vouchers')}>🎟️ Voucher / Deal</button>
          <button className={tab === 'platforms' ? 'active' : ''} onClick={() => setTab('platforms')}>🛍️ Nền tảng affiliate</button>
        </div>
      </div>

      {tab === 'platforms' && (
        <>
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nền tảng</th>
                    <th>Mô tả</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {mockPlatforms.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>{p.description}</td>
                      <td><span className="badge badge-success">Đang hoạt động</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mock-note">Dữ liệu minh họa (mock) — cấu hình API key/affiliate ID thật sẽ triển khai ở phase sau.</p>
        </>
      )}

      {tab === 'vouchers' && (
        <>
          {showQuickAdd && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>⚡ Nhập nhanh nhiều voucher cùng lúc</h3>
              <p className="muted-copy">
                Mỗi dòng một voucher, các cột cách nhau bằng dấu <code>|</code>: <br />
                <code>Nền tảng | Tiêu đề | Mã | Giảm giá | Điều kiện | HSD | Nguồn | Sàn áp dụng</code> (Điều kiện/HSD/Nguồn/Sàn
                áp dụng có thể để trống — để trống Sàn áp dụng nghĩa là dùng được cho mọi sàn). Cột Sàn áp dụng nhận
                <code>SHOPEE</code>, <code>TIKTOK_SHOP</code>, <code>LAZADA</code>, cách nhau bằng dấu phẩy nếu nhiều sàn.
                Dùng để dán nhanh từ group săn sale hoặc trang tổng hợp mã bạn đã tổng hợp sẵn.
              </p>
              <textarea
                className="support-chat-textarea"
                style={{ minHeight: 120, fontFamily: 'monospace', fontSize: '0.82rem' }}
                placeholder={QUICK_ADD_PLACEHOLDER}
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
              />
              {quickAddResult && (
                <div style={{ marginTop: 10 }}>
                  {quickAddResult.added > 0 && (
                    <p style={{ color: '#15803d', fontWeight: 700 }}>✓ Đã thêm {quickAddResult.added} voucher.</p>
                  )}
                  {quickAddResult.errors.map((err, i) => (
                    <p key={i} className="admin-gate-error">{err}</p>
                  ))}
                </div>
              )}
              <button
                className="button button-primary"
                style={{ marginTop: 10 }}
                onClick={handleQuickAdd}
                disabled={quickAddSaving || !quickAddText.trim()}
              >
                {quickAddSaving ? 'Đang nhập...' : '⚡ Nhập hàng loạt'}
              </button>
            </div>
          )}

          <AdminSearchToolbar
            query={voucherSearch}
            onQueryChange={setVoucherSearch}
            placeholder="Tìm theo mã voucher, tiêu đề, nguồn..."
            filterValue={voucherPlatformFilter}
            onFilterChange={setVoucherPlatformFilter}
            filterOptions={VOUCHER_FILTER_OPTIONS}
            resultCount={filteredVouchers.length}
            resultLabel="voucher"
          />

          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nền tảng</th>
                    <th>Nội dung</th>
                    <th>Mã</th>
                    <th>Điều kiện</th>
                    <th>Sàn áp dụng</th>
                    <th>Nguồn</th>
                    <th>HSD</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <SocialPlatformIcon name={v.platform} size={28} />
                          <span>{v.platform}</span>
                        </div>
                      </td>
                      <td>{v.title} — {v.discount}</td>
                      <td><CopyIdChip value={v.code} /></td>
                      <td>{v.condition}</td>
                      <td>
                        {!v.marketplaces || v.marketplaces.length === 0
                          ? <span className="badge badge-neutral">Tất cả sàn</span>
                          : v.marketplaces.map((m) => MARKETPLACE_CODE_TO_LABEL[m]).join(', ')}
                      </td>
                      <td>{v.source || '—'}</td>
                      <td>{v.expiry}</td>
                      <td><span className={`badge ${v.status === 'Limited' ? 'badge-warning' : 'badge-success'}`}>{v.status === 'Limited' ? 'Có hạn' : 'Vô thời hạn'}</span></td>
                      <td>
                        <div className="admin-action-row">
                          <button className="btn-approve" onClick={() => openEdit(v)}>Sửa</button>
                          <button className="btn-reject" onClick={() => remove(v.id)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted-copy">
                        {vouchers.length === 0 ? 'Chưa có voucher nào — bấm "Thêm voucher" hoặc "Nhập nhanh" để tạo.' : 'Không tìm thấy voucher phù hợp.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mock-note">
            Dữ liệu thật từ Firestore (collection <code>socialVouchers</code>) — hiển thị trực tiếp cho khách ngay
            trong trang &quot;Nhận hoàn tiền&quot; (không còn menu Voucher MXH riêng). Trường <code>source</code> chỉ
            để Admin ghi chú nơi lấy mã (group/trang tổng hợp) — cấu trúc dữ liệu đã sẵn sàng để sau này nối thêm
            nguồn tự động qua API mà không cần đổi schema.
          </p>
        </>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)}>
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Sửa voucher' : 'Thêm voucher mới'}</h3>
        <div className="bank-add-form">
          <div>
            <span className="field-label">Nền tảng</span>
            <div className="voucher-platform-picker">
              {SOCIAL_PLATFORMS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`voucher-platform-option${form.platform === p ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, platform: p as SocialPlatform })}
                >
                  <SocialPlatformIcon name={p} size={32} />
                  <span>{p}</span>
                </button>
              ))}
            </div>
          </div>
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
            <span className="field-label">Nguồn (tuỳ chọn — group/trang bạn lấy mã)</span>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="VD: Group Săn Sale Mỗi Ngày" />
          </label>
          <div>
            <span className="field-label">Sàn áp dụng (bỏ trống = dùng được cho mọi sàn)</span>
            <div className="admin-action-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {MARKETPLACE_OPTIONS.map((m) => {
                const checked = (form.marketplaces ?? []).includes(m.value);
                return (
                  <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const current = form.marketplaces ?? [];
                        setForm({
                          ...form,
                          marketplaces: e.target.checked ? [...current, m.value] : current.filter((v) => v !== m.value),
                        });
                      }}
                    />
                    {m.label}
                  </label>
                );
              })}
            </div>
          </div>
          <label>
            <span className="field-label">Trạng thái</span>
            <select className="wd-bank-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Valid">Vô thời hạn</option>
              <option value="Limited">Có hạn</option>
            </select>
          </label>
          <button className="button button-primary" onClick={handleSave} disabled={saving || !form.title || !form.code}>
            {saving ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Thêm voucher'}
          </button>
        </div>
      </Modal>
    </AdminShell>
  );
}
