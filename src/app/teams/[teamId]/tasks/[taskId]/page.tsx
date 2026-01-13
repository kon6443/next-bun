import TaskDetailPage from "./TaskDetailPage";

type TaskDetailPageProps = {
  params: Promise<{ teamId: string; taskId: string }>;
};

export default async function Page({ params }: TaskDetailPageProps) {
  const { teamId, taskId } = await params;
  return <TaskDetailPage teamId={teamId} taskId={taskId} />;
}
