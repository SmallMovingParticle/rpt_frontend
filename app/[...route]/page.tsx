import { redirect } from 'next/navigation';
import { getStaffUser } from './../session';
import { DashboardShell } from './../dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function DashboardRoute() {
  // getStaffUser() already enforces the allowlist and signature, so an
  // unauthenticated or de-listed visitor never reaches the shell.
  const user = await getStaffUser();
  if (!user) redirect('/login');

  return <DashboardShell displayName={user.displayName} localPreview={false} />;
}
