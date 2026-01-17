"use client";

import { use } from "react";
import TaskDetailPage from "./TaskDetailPage";

type TaskDetailPageProps = {
  params: Promise<{ teamId: string; taskId: string }>;
};

export default function Page({ params }: TaskDetailPageProps) {
  const { teamId, taskId } = use(params);
  return <TaskDetailPage teamId={teamId} taskId={taskId} />;
}
