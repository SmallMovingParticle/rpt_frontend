import { redirect } from 'next/navigation';
import { getStaffUser } from '../session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getStaffUser()) redirect('/');
  const configured =
    (process.env.DASHBOARD_STAFF_PASSWORD ?? '').length >= 12 &&
    (process.env.DASHBOARD_SESSION_SECRET ?? '').length >= 32 &&
    (process.env.DASHBOARD_ALLOWED_EMAILS ?? '').trim().length > 0;

  return <LoginForm configured={configured} />;
}
