'use client';

import { RequireAdmin } from '../../components/layout/RequireAdmin';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
