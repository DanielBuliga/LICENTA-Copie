export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
};

export type ProjectListItem = {
  id: number;
  title: string;
  description: string | null;
  role: string;
  created_at: string;
};

export type ProjectCreate = {
  title: string;
  description?: string | null;
};

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "READY_TO_CLOSE" | "CLOSED";

export type TaskPublic = {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  parent_task_id: number | null;
  priority: number;
  estimate_minutes: number;
  deadline: string;
  status: TaskStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
};

