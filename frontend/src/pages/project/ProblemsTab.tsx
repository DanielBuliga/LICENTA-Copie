import { useCallback, useEffect, useState } from "react";
import { Alert, Card, CardContent, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";

type ProblemItem = {
  task_id: number;
  task_title?: string | null;
  type: string;
  reason: string;
  deadline: string;
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
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>
                {problem.task_title || `Task #${problem.task_id}`}
              </Typography>
              <Chip label={problem.type} color="warning" size="small" />
            </Stack>
            <Typography sx={{ mt: 1 }}>{problem.reason}</Typography>
            <Typography sx={{ color: "text.secondary", mt: 0.5 }}>
              Deadline: {dayjs(problem.deadline).format("DD.MM.YYYY HH:mm")}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
