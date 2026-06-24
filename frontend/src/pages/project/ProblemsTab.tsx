import { useCallback, useEffect, useState } from "react";
import { Alert, Card, CardContent, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { apiDate } from "../../utils/dateTime";

type ProblemItem = {
  task_id: number;
  task_title?: string | null;
  task_path?: string | null;
  type: string;
  types?: string[] | null;
  reason: string;
  reasons?: string[] | null;
  deadline: string;
};

const problemColors: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info"> = {
  MISSED_PLANNED_WORK: "error",
  DEADLINE_PASSED: "error",
  AVAILABILITY_CONFLICT: "warning",
  INACTIVE_MEMBER: "error",
  AT_RISK: "warning",
  BLOCKED: "secondary",
  NO_SKILLS: "info",
};

export function ProblemsTab({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ problems: ProblemItem[] }>(`/projects/${projectId}/plan/problems`);
      setItems(res.data.problems);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca problemele"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack spacing={2}>
      {loading ? <LinearProgress /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {items.length === 0 && !loading ? <Alert severity="success">Nu există probleme detectate în plan.</Alert> : null}
      {items.map((problem) => (
        <Card key={`${problem.task_id}-${problem.type}-${problem.reason}`}>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
              <Typography sx={{ fontWeight: 800 }}>
                {problem.task_path || problem.task_title || `Task #${problem.task_id}`}
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(problem.types?.length ? problem.types : [problem.type]).map((type) => (
                  <Chip key={type} label={type} color={problemColors[type] ?? "warning"} size="small" sx={{ fontWeight: 900 }} />
                ))}
              </Stack>
            </Stack>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {(problem.reasons?.length ? problem.reasons : [problem.reason]).map((reason) => (
                <Typography key={reason}>{reason}</Typography>
              ))}
            </Stack>
            <Typography sx={{ color: "text.secondary", mt: 0.5 }}>
              Deadline: {apiDate(problem.deadline).format("DD.MM.YYYY HH:mm")}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
