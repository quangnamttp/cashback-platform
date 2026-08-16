'use client';

import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

const platformMap: Record<string, { label: string; color: string }> = {
  shopee: { label: 'Shopee', color: '#ee4d2d' },
  'tiktok-shop': { label: 'TikTok Shop', color: '#0ea5e9' },
  lazada: { label: 'Lazada', color: '#f59e0b' },
};

export function LinkChecker() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [platformKey, setPlatformKey] = useState<string | null>(null);

  const detected = useMemo(() => {
    if (!url.trim()) return null;
    const normalized = url.toLowerCase();
    if (normalized.includes('shopee')) return 'shopee';
    if (normalized.includes('tiktok')) return 'tiktok-shop';
    if (normalized.includes('lazada')) return 'lazada';
    return null;
  }, [url]);

  const handleCheck = () => {
    if (!url.trim()) {
      setStatus('invalid');
      setPlatformKey(null);
      return;
    }

    setStatus('checking');

    window.setTimeout(() => {
      if (detected) {
        setPlatformKey(detected);
        setStatus('valid');
      } else {
        setPlatformKey(null);
        setStatus('invalid');
      }
    }, 900);
  };

  const platformInfo = platformKey ? platformMap[platformKey] : null;

  return (
    <div className="link-checker">
      <div className="field-group">
        <label htmlFor="product-link">Link sản phẩm</label>
        <div className="inline-input-row">
          <input
            id="product-link"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Dán link sản phẩm từ Shopee, TikTok Shop hoặc Lazada..."
          />
          <Button type="button" onClick={handleCheck}>Nhận hoàn tiền</Button>
        </div>
      </div>

      <div className="checker-status-row">
        {status === 'checking' && <Badge variant="info">Đang kiểm tra link...</Badge>}
        {status === 'valid' && platformInfo && (
          <Badge variant="success">Link hợp lệ • {platformInfo.label}</Badge>
        )}
        {status === 'invalid' && <Badge variant="danger">Link không hợp lệ hoặc nền tảng chưa được hỗ trợ.</Badge>}
      </div>

      {platformInfo && (
        <div className="link-result-card">
          <div className="result-topline">
            <span className="dot" style={{ background: platformInfo.color }} />
            <strong>{platformInfo.label}</strong>
          </div>
          <div className="result-grid">
            <div>
              <span className="result-label">URL chuẩn hóa</span>
              <div className="result-value">{url.trim() || '—'}</div>
            </div>
            <div>
              <span className="result-label">Cashback dự kiến</span>
              <div className="result-value">Không chắc chắn • chờ xác nhận commission</div>
            </div>
          </div>
          <div className="result-actions">
            <Button variant="secondary">Tiếp tục mua hàng</Button>
            <Button variant="ghost">Xem chi tiết</Button>
          </div>
        </div>
      )}
    </div>
  );
}
