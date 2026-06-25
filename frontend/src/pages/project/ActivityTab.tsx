import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Card, CardContent, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { apiDate, formatApiDate } from "../../utils/dateTime";

type ActivityItem = {
  id: number;
  project_id: number;
  actor_id: number | null;
  actor_name?: string | null;
  actor_email?: string | null;
  event_type: string;
  entity_type?: string | null;
  entity_id?: number | null;
  title: string;
  details?: string | null;
  created_at: string;
};

type TaskItem = {
  id: number;
  title: string;
};

const eventLabels: Record<string, string> = {
  PROJECT_CREATED: "Proiect",
  MEMBER_ADDED: "Membru",
  MEMBER_REMOVED: "Membru",
  MEMBER_ROLE_CHANGED: "Rol",
  MEMBER_STATUS_CHANGED: "Status",
  TASK_CREATED: "Task",
  TASK_UPDATED: "Task",
  TASK_DEADLINE_CHANGED: "Deadline",
  TASK_DELETED: "Task",
  TASK_ASSIGNED: "Asignare",
  TASK_UNASSIGNED: "Asignare",
  ASSIGNMENT_STATUS_CHANGED: "Status task",
  TASK_READY_TO_CLOSE: "Verificare",
  TASK_CLOSED: "Finalizare",
  PLAN_GENERATED: "Plan",
  AVAILABILITY_PLAN_IMPACT: "Disponibilitate",
};

const eventColors: Record<string, "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info"> = {
  PROJECT_CREATED: "primary",
  MEMBER_ADDED: "info",
  MEMBER_REMOVED: "warning",
  MEMBER_ROLE_CHANGED: "secondary",
  MEMBER_STATUS_CHANGED: "warning",
  TASK_CREATED: "primary",
  TASK_UPDATED: "default",
  TASK_DEADLINE_CHANGED: "error",
  TASK_DELETED: "warning",
  TASK_ASSIGNED: "info",
  TASK_UNASSIGNED: "warning",
  ASSIGNMENT_STATUS_CHANGED: "success",
  TASK_READY_TO_CLOSE: "info",
  TASK_CLOSED: "success",
  PLAN_GENERATED: "primary",
  AVAILABILITY_PLAN_IMPACT: "warning",
};

const changeChipMeta: Record<string, { label: string; color: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info" }> = {
  "estimare:": { label: "Estimare", color: "info" },
  "deadline:": { label: "Deadline", color: "error" },
  "prioritate:": { label: "Prioritate", color: "warning" },
  "parinte:": { label: "Părinte", color: "secondary" },
  "status:": { label: "Status", color: "success" },
  "titlu:": { label: "Titlu", color: "default" },
};

function changeChipsFor(item: ActivityItem) {
  if (!item.details || !item.event_type.startsWith("TASK_")) return [];
  const primaryLabel = eventLabels[item.event_type];
  return Object.entries(changeChipMeta)
    .filter(([needle]) => item.details?.includes(needle))
    .filter(([, meta]) => meta.label !== primaryLabel)
    .map(([, meta]) => meta);
}

function formatActivityDetails(details: string) {
  return details.replace(
    /\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\b/g,
    (_match, date: string, time: string) => formatApiDate(`${date}T${time}`, "DD.MM.YYYY HH:mm")
  );
}

export function ActivityTab({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [tasksById, setTasksById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activityRes, tasksRes] = await Promise.all([
        api.get<ActivityItem[]>(`/projects/${projectId}/activity`),
        api.get<TaskItem[]>(`/projects/${projectId}/tasks`),
      ]);
      setItems(activityRes.data);
      setTasksById(Object.fromEntries(tasksRes.data.map((task) => [task.id, task.title])));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca istoricul proiectului"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const byDay: Record<string, ActivityItem[]> = {};
    for (const item of items) {
      const key = apiDate(item.created_at).format("DD MMMM YYYY");
      byDay[key] = [...(byDay[key] ?? []), item];
    }
    return Object.entries(byDay);
  }, [items]);

  return (
    <Stack spacing={2}>
      {loading ? <LinearProgress /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 0.5 }}>
            <HistoryRoundedIcon color="primary" />
            <Typography variant="h6">Istoric proiect</Typography>
          </Stack>
          <Typography sx={{ color: "text.secondary" }}>
            Evenimente importante despre membri, taskuri, asignări și planificare.
          </Typography>
        </CardContent>
      </Card>

      {grouped.map(([day, dayItems]) => (
        <Stack key={day} spacing={1.25}>
          <Typography sx={{ color: "text.secondary", fontWeight: 900, px: 0.5 }}>{day}</Typography>
          {dayItems.map((item) => {
            const actor = item.actor_name || item.actor_email || (item.actor_id ? `User #${item.actor_id}` : "Sistem");
            const changeChips = changeChipsFor(item);
            return (
              <Card key={item.id}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 0.75 }}>
                        <Chip size="small" color={eventColors[item.event_type] ?? "default"} label={eventLabels[item.event_type] ?? item.event_type} sx={{ fontWeight: 900 }} />
                        {changeChips.map((chip) => (
                          <Chip key={chip.label} size="small" color={chip.color} variant="outlined" label={chip.label} sx={{ fontWeight: 900 }} />
                        ))}
                        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                          {apiDate(item.created_at).format("HH:mm")} · {actor}
                        </Typography>
                      </Stack>
                      <Typography sx={{ fontWeight: 950 }}>{item.title}</Typography>
                      {item.details ? (
                        <Typography sx={{ color: "text.secondary", mt: 0.5 }}>
                          {formatActivityDetails(item.details).replace(
                            /parinte: (fara|\d+) -> (fara|\d+)/g,
                            (_match, from: string, to: string) =>
                              `parinte: ${from === "fara" ? "fara" : tasksById[Number(from)] ?? `Task #${from}`} -> ${to === "fara" ? "fara" : tasksById[Number(to)] ?? `Task #${to}`}`
                          )}
                        </Typography>
                      ) : null}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      ))}

      {!loading && items.length === 0 ? (
        <Card>
          <CardContent sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
            Nu există încă evenimente în istoricul proiectului.
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
