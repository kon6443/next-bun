import { TeamsPageLayout, TeamBoardSkeleton } from "../components";

export default function TeamDetailLoading() {
  return (
    <TeamsPageLayout maxWidth="6xl">
      <TeamBoardSkeleton />
    </TeamsPageLayout>
  );
}
