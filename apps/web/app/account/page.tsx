import Link from 'next/link';
import { AppShell } from '../../components/layout/AppShell';

export default function AccountPage() {
  return (
    <AppShell>
    <div className="page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Account</span>
          <h1>Profile & login</h1>
        </div>
      </div>

      <section className="two-column-grid">
        <div className="panel auth-panel">
          <h3>Google login</h3>
          <p className="muted-copy">Continue with Google to access your cashback wallet and referral activity.</p>
          <button className="button button-primary wide-button">Continue with Google</button>
        </div>

        <div className="panel">
          <h3>User profile</h3>
          <div className="profile-grid">
            <div><span className="field-label">Name</span><strong>Nguyen Minh</strong></div>
            <div><span className="field-label">Email</span><strong>minh.nguyen@gmail.com</strong></div>
            <div><span className="field-label">Referral code</span><strong>REF-MINH-2026</strong></div>
            <div><span className="field-label">Account status</span><strong>Active</strong></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Referral foundation</h3>
          <Link href="/referrals" className="text-link">View referrals</Link>
        </div>
        <p className="muted-copy">
          Every user has a unique referral link/code. Rewards are only payable after the referred purchase is complete and the related transaction/commission is confirmed.
        </p>
      </section>
    </div>
    </AppShell>
  );
}
