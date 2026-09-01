'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { isGoogleDriveConfigured, uploadFileToDrive } from '../../lib/googleDrive';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';

type UserProfile = {
  phone?: string | null;
  birthday?: string | null;
  referralCode?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-success',
  SUSPENDED: 'badge-warning',
  LOCKED: 'badge-danger',
};

export default function AccountPage() {
  const { t } = useLanguage();
  usePageTitle(t('account_title'));
  const { userName, userEmail, avatarUrl, uid } = useAuth();
  const [profile, setProfile] = useState<UserProfile>({});
  const [editingField, setEditingField] = useState<'phone' | 'birthday' | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<'not_configured' | 'error' | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = onSnapshot(doc(getFirebaseDb(), 'users', uid), (snap) => {
      setProfile(snap.data() as UserProfile ?? {});
    });
    return unsubscribe;
  }, [uid]);

  const startEdit = (field: 'phone' | 'birthday') => {
    setFieldInput((field === 'phone' ? profile.phone : profile.birthday) ?? '');
    setEditingField(field);
  };

  const saveField = async () => {
    if (!uid || !editingField) return;
    setSaving(true);
    try {
      // Owner can update their own non-role/status profile fields directly
      // per Firestore rules — no Cloud Function round-trip needed.
      await updateDoc(doc(getFirebaseDb(), 'users', uid), { [editingField]: fieldInput.trim() || null });
      setEditingField(null);
    } catch (err) {
      console.error('update profile field failed', err);
    } finally {
      setSaving(false);
    }
  };

  const copyReferralCode = async () => {
    if (!profile.referralCode) return;
    try {
      await navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  // Uploads to the SIGNED-IN USER'S OWN Google Drive via OAuth in the
  // browser (no service account, no server) — each person connects their
  // own Drive once; the resulting file is made link-public so it can be
  // used as a plain <img src>.
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setAvatarError(null);

    if (!isGoogleDriveConfigured()) {
      setAvatarError('not_configured');
      return;
    }

    setAvatarUploading(true);
    try {
      const result = await uploadFileToDrive({ file, fileName: file.name, mimeType: file.type, makePublic: true });
      await updateDoc(doc(getFirebaseDb(), 'users', uid), { avatarUrl: result.publicUrl });
      await addDoc(collection(getFirebaseDb(), 'driveFiles'), {
        ownerUserId: uid,
        category: 'avatar',
        driveFileId: result.fileId,
        webViewLink: result.webViewLink,
        publicUrl: result.publicUrl,
        fileName: file.name,
        mimeType: file.type,
        uploadedBy: uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('avatar upload failed', err);
      setAvatarError('error');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <div className="page-header">
            <div>
              <span className="eyebrow dark">{t('account_eyebrow')}</span>
              <h1>{t('account_title')}</h1>
            </div>
          </div>

          <section className="profile-header-card">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={userName} />
                ) : (
                  '👤'
                )}
              </div>
              <button
                type="button"
                className="profile-avatar-edit-btn"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label={t('profile_avatar_change')}
              >
                📷
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
            </div>
            <div className="profile-header-info">
              <h2>{userName || t('user_profile')}</h2>
              <span>{userEmail}</span>
            </div>
            <span className={`badge ${STATUS_BADGE[profile.status ?? 'ACTIVE']}`}>
              {profile.status === 'SUSPENDED' ? t('status_suspended') : profile.status === 'LOCKED' ? t('status_locked') : t('active_status')}
            </span>
          </section>

          {avatarUploading && <p className="muted-copy" style={{ marginTop: 6 }}>{t('profile_avatar_uploading')}</p>}
          {avatarError && (
            <p className="admin-gate-error" style={{ marginTop: 6 }}>
              {avatarError === 'not_configured' ? t('profile_avatar_error_not_configured') : t('profile_avatar_error_generic')}
            </p>
          )}

          <section className="panel" style={{ marginTop: 16 }}>
            <h3>{t('user_profile')}</h3>
            <div className="profile-field-list">
              <div className="profile-field-row">
                <span className="profile-field-label">{t('field_email')}</span>
                <span className="profile-field-value">{userEmail || '—'}</span>
              </div>

              <div className="profile-field-row">
                <span className="profile-field-label">{t('field_phone')}</span>
                {editingField === 'phone' ? (
                  <span className="profile-field-value">
                    <input type="tel" value={fieldInput} onChange={(e) => setFieldInput(e.target.value)} placeholder={t('profile_phone_placeholder')} />
                    <button type="button" className="button button-primary" style={{ padding: '4px 12px' }} onClick={saveField} disabled={saving}>
                      {saving ? '...' : t('profile_field_save')}
                    </button>
                  </span>
                ) : (
                  <span className="profile-field-value">
                    {profile.phone || t('profile_not_updated')}
                    <button type="button" className="text-link" onClick={() => startEdit('phone')}>{t('profile_field_edit')}</button>
                  </span>
                )}
              </div>

              <div className="profile-field-row">
                <span className="profile-field-label">{t('field_birthday')}</span>
                {editingField === 'birthday' ? (
                  <span className="profile-field-value">
                    <input type="date" value={fieldInput} onChange={(e) => setFieldInput(e.target.value)} />
                    <button type="button" className="button button-primary" style={{ padding: '4px 12px' }} onClick={saveField} disabled={saving}>
                      {saving ? '...' : t('profile_field_save')}
                    </button>
                  </span>
                ) : (
                  <span className="profile-field-value">
                    {profile.birthday || t('profile_not_updated')}
                    <button type="button" className="text-link" onClick={() => startEdit('birthday')}>{t('profile_field_edit')}</button>
                  </span>
                )}
              </div>

              <div className="profile-field-row">
                <span className="profile-field-label">{t('field_referral_code')}</span>
                <span className="profile-field-value">
                  <span className="referral-code-chip">{profile.referralCode || '—'}</span>
                  {profile.referralCode && (
                    <button type="button" className="text-link" onClick={copyReferralCode}>
                      {copied ? `✓ ${t('profile_referral_copied')}` : t('profile_referral_copy')}
                    </button>
                  )}
                </span>
              </div>

              <div className="profile-field-row">
                <span className="profile-field-label">{t('field_account_status')}</span>
                <span className="profile-field-value">
                  {profile.status === 'SUSPENDED' ? t('status_suspended') : profile.status === 'LOCKED' ? t('status_locked') : t('active_status')}
                </span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h3>{t('referral_foundation')}</h3>
              <Link href="/referrals" className="text-link">{t('view_referrals')}</Link>
            </div>
            <p className="muted-copy">{t('referral_foundation_desc')}</p>
          </section>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
