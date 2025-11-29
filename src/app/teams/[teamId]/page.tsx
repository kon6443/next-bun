import TeamBoard from "./TeamBoard";

type TeamDetailPageProps = {
  params: Promise<{ teamId: string }>;
};

export default async function TeamDetailPage({ params }: TeamDetailPageProps) {
  const { teamId } = await params;
  return <TeamBoard teamId={teamId} />;
}

