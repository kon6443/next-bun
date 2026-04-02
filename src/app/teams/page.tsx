import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import TeamsDashboard from './TeamsDashboard';
import TeamsLanding from './TeamsLanding';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.accessToken) {
    return <TeamsDashboard />;
  }
  return <TeamsLanding />;
}
