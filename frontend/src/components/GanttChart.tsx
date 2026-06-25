import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import "dayjs/locale/ro";

import type { TaskStatus } from "../api/types";
import { apiDate } from "../utils/dateTime";
import { getProjectColor, projectPalette } from "../utils/projectColors";

export type GanttTask = {
  id: number;
  project_id: number;
  project_title: string;
  title: string;
  status: TaskStatus | string;
  priority: number;
  created_at: string;
  updated_at?: string;
  deadline: string;
};

type Props = {
  title: string;
  subtitle?: string;
  tasks: GanttTask[];
  compact?: boolean;
};

function statusLabel(status: string) {
  if (status === "OPEN") return "De făcut";
  if (status === "IN_PROGRESS") return "În progres";
  if (status === "READY_TO_CLOSE") return "Ready";
  if (status === "CLOSED") return "Finalizat";
  return status;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRoDate(value: dayjs.Dayjs, format: string) {
  return capitalizeFirst(value.locale("ro").format(format));
}

function taskStart(task: GanttTask) {
  const created = apiDate(task.created_at);
  if (created.isValid()) return created.startOf("day");
  return apiDate(task.deadline).subtract(Math.max(1, Math.ceil(task.priority)), "day").startOf("day");
}

export function GanttChart({ title, subtitle, tasks, compact = false }: Props) {
  const visibleTasks = [...tasks]
    .filter((task) => apiDate(task.deadline).isValid())
    .sort((a, b) => apiDate(a.deadline).valueOf() - apiDate(b.deadline).valueOf());

  const starts = visibleTasks.map(taskStart);
  const ends = visibleTasks.map((task) => apiDate(task.deadline).endOf("day"));
  const minDate = (starts.length ? dayjs(Math.min(...starts.map((item) => item.valueOf()))) : dayjs()).startOf("day");
  const maxDate = (ends.length ? dayjs(Math.max(...ends.map((item) => item.valueOf()))) : dayjs().add(7, "day")).endOf("day");
  const totalDays = Math.max(maxDate.diff(minDate, "day") + 1, 1);
  const ticks = Array.from({ length: Math.min(totalDays, compact ? 8 : 12) }, (_, index) => {
    const ratio = Math.min(index / Math.max((compact ? 7 : 11), 1), 1);
    return minDate.add(Math.round((totalDays - 1) * ratio), "day");
  });
  const projectLegend = Array.from(new Map(visibleTasks.map((task) => [task.project_id, task.project_title])).entries());
  const colorByProject = new Map(projectLegend.map(([projectId], index) => [projectId, projectPalette[index % projectPalette.length]]));
  const colorForProject = (projectId: number) => colorByProject.get(projectId) ?? getProjectColor(projectId);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            {subtitle ? <Typography sx={{ color: "text.secondary" }}>{subtitle}</Typography> : null}
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            {projectLegend.slice(0, 6).map(([projectId, projectTitle]) => (
              <Chip
                key={projectId}
                size="small"
                label={projectTitle}
                sx={{ bgcolor: alpha(colorForProject(projectId), 0.14), color: colorForProject(projectId), fontWeight: 900 }}
              />
            ))}
          </Stack>
        </Stack>

        {visibleTasks.length === 0 ? (
          <Typography sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>Nu există task-uri pentru diagrama Gantt.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Box sx={{ minWidth: compact ? 720 : 920 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 1.5, mb: 1 }}>
                <Box />
                <Box sx={{ position: "relative", height: 28, borderBottom: "1px solid", borderColor: "divider" }}>
                  {ticks.map((tick) => {
                    const left = `${(tick.diff(minDate, "day") / Math.max(totalDays - 1, 1)) * 100}%`;
                    return (
                      <Typography key={tick.toISOString()} sx={{ position: "absolute", left, transform: "translateX(-50%)", fontSize: 12, color: "text.secondary", fontWeight: 800 }}>
                        {formatRoDate(tick, "DD MMM")}
                      </Typography>
                    );
                  })}
                </Box>
              </Box>

              <Stack spacing={1}>
                {visibleTasks.map((task) => {
                  const start = taskStart(task);
                  const end = apiDate(task.deadline).endOf("day");
                  const offset = Math.max(start.diff(minDate, "day"), 0);
                  const duration = Math.max(end.diff(start, "day") + 1, 1);
                  const left = `${(offset / totalDays) * 100}%`;
                  const width = `${Math.max((duration / totalDays) * 100, 2)}%`;
                  const color = colorForProject(task.project_id);
                  const overdue = task.status !== "CLOSED" && apiDate(task.deadline).isBefore(dayjs());

                  return (
                    <Box key={`${task.project_id}-${task.id}`} sx={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 1.5, alignItems: "center" }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 900 }}>{task.title}</Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
                          <Typography noWrap sx={{ color: "text.secondary", fontSize: 12 }}>{task.project_title}</Typography>
                        </Stack>
                      </Box>
                      <Box sx={{ position: "relative", height: 34, bgcolor: "action.hover", borderRadius: 1.5, overflow: "hidden" }}>
                        <Box sx={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)", backgroundSize: `${100 / Math.max(totalDays, 1)}% 100%` }} />
                        <Box
                          title={`${task.title}: ${formatRoDate(start, "DD MMM")} - ${formatRoDate(end, "DD MMM YYYY")}`}
                          sx={{
                            position: "absolute",
                            left,
                            width,
                            top: 6,
                            height: 22,
                            borderRadius: 1,
                            bgcolor: color,
                            boxShadow: `0 8px 18px ${alpha(color, 0.28)}`,
                            opacity: task.status === "CLOSED" ? 0.62 : 1,
                          }}
                        />
                        <Chip
                          size="small"
                          label={overdue ? "Depășit" : statusLabel(task.status)}
                          sx={{ position: "absolute", right: 6, top: 5, height: 24, bgcolor: overdue ? "#FEE2E2" : "background.paper", color: overdue ? "#991B1B" : "text.secondary", fontWeight: 900 }}
                        />
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
