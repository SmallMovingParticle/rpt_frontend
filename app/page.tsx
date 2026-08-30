import { notFound, redirect } from 'next/navigation';
import { getChatGPTUser, isAllowedDashboardEmail } from './chatgpt-auth';
import { DashboardShell } from './dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  const localPreview =
    process.env.NODE_ENV !== 'production' &&
    process.env.DASHBOARD_ALLOW_LOCAL_DEMO === 'true';

  if (!user && !localPreview) redirect('/signin-with-chatgpt?return_to=%2F');
  if (process.env.NODE_ENV === 'production' && (!user || !isAllowedDashboardEmail(user.email))) notFound();

  return <DashboardShell displayName={user?.displayName ?? 'Sarah Johnson'} localPreview={localPreview} />;
}
