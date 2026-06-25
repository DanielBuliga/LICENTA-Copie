import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";
import ViewListRoundedIcon from "@mui/icons-material/ViewListRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import dayjs from "dayjs";
import "dayjs/locale/ro";
import type { Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useAccentColor } from "../hooks/useAccentColor";
import { apiDate } from "../utils/dateTime";

type MemberStatus = "TODO" | "IN_PROGRESS" | "DONE";
type CurrentUser = { id: number; email: string; name?: string | null };
type MyTask = { id: number; project_id: number; project_title: string; parent_task_id: number | null; parent_task_title?: string | null; title: string; description: string | null; priority: number; estimate_minutes: number; deadline: string; status: string; member_status: MemberStatus; assigned_minutes: number | null };
type StatusFilter = "ALL" | "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
type PriorityFilter = "ALL" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";
type ViewMode = "LIST" | "COLUMNS";

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRoDate(value: Dayjs, format: string) {
  return capitalizeFirst(value.locale("ro").format(format));
}

function priorityInfo(priority: number) {
  if (priority >= 5) return { label: "Urgent", color: "#DC2626", bucket: "URGENT" as const };
  if (priority === 4) return { label: "Ridicat", color: "#D97706", bucket: "HIGH" as const };
  if (priority === 3) return { label: "Mediu", color: "#0284C7", bucket: "MEDIUM" as const };
  return { label: "Scăzut", color: "#64748B", bucket: "LOW" as const };
}

function matchesStatus(task: MyTask, filter: StatusFilter) {
  if (filter === "ALL") return true;
  if (filter === "BLOCKED") return task.status === "OPEN" && apiDate(task.deadline).isBefore(dayjs()) && task.member_status !== "DONE";
  return task.member_status === filter;
}

function statusIcon(status: MemberStatus) {
  if (status === "DONE") return <TaskAltRoundedIcon />;
  if (status === "IN_PROGRESS") return <ScheduleRoundedIcon />;
  return <RadioButtonUncheckedRoundedIcon />;
}

export function ActivitiesPage() {
  const nav = useNavigate();
  const accent = useAccentColor();
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("LIST");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tasksRes, meRes] = await Promise.all([api.get<MyTask[]>("/users/me/tasks"), api.get<CurrentUser>("/users/me")]);
      setTasks(tasksRes.data);
      setMe(meRes.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca activitățile"));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(taskId: number, status: MemberStatus) {
    if (!me) return;
    setUpdatingId(taskId);
    setError(null);
    try {
      await api.patch(`/tasks/${taskId}/assignments/${me.id}`, { member_status: status });
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza statusul task-ului"));
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = useMemo(() => tasks.filter((task) => {
    const priority = priorityInfo(task.priority);
    const priorityOk = priorityFilter === "ALL" || priority.bucket === priorityFilter;
    return matchesStatus(task, statusFilter) && priorityOk;
  }), [priorityFilter, statusFilter, tasks]);

  const done = tasks.filter((task) => task.member_status === "DONE").length;
  const kanbanColumns = [
    { key: "TODO" as const, title: "De făcut", color: "#64748B", items: filtered.filter((task) => task.member_status === "TODO") },
    { key: "IN_PROGRESS" as const, title: "În progres", color: "#3B82F6", items: filtered.filter((task) => task.member_status === "IN_PROGRESS") },
    { key: "DONE" as const, title: "Finalizat", color: "#22C55E", items: filtered.filter((task) => task.member_status === "DONE") },
  ];

  return (
    <AppLayout title="Activități">
      <Stack spacing={2.5}>
        <Box><Typography sx={{ color: "text.secondary" }}>{tasks.length} total · {done} finalizate</Typography></Box>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", md: "center" } }}>
          <ToggleButtonGroup exclusive value={statusFilter} onChange={(_, value) => value && setStatusFilter(value)} sx={{ bgcolor: "background.paper", borderRadius: 2, p: 0.5, border: "1px solid", borderColor: "divider", flexWrap: "wrap", "& .MuiToggleButton-root": { border: 0, borderRadius: 1.5, px: 2, fontWeight: 800, color: "text.secondary", "&.Mui-selected": { bgcolor: "background.default", color: "text.primary", boxShadow: "0 4px 14px rgba(15,23,42,0.08)" } } }}>
            <ToggleButton value="ALL">Toate</ToggleButton>
            <ToggleButton value="TODO">De făcut</ToggleButton>
            <ToggleButton value="IN_PROGRESS">În progres</ToggleButton>
            <ToggleButton value="DONE">Finalizate</ToggleButton>
            <ToggleButton value="BLOCKED">Blocate</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <Select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)} displayEmpty startAdornment={<FilterListRoundedIcon sx={{ mr: 1, color: "text.secondary" }} />} sx={{ bgcolor: "background.paper", borderRadius: 2, fontWeight: 800 }}>
              <MenuItem value="ALL">Toate</MenuItem>
              <MenuItem value="URGENT">Urgente</MenuItem>
              <MenuItem value="HIGH">Ridicate</MenuItem>
              <MenuItem value="MEDIUM">Medii</MenuItem>
              <MenuItem value="LOW">Scăzute</MenuItem>
            </Select>
          </FormControl>
          <ToggleButtonGroup exclusive value={viewMode} onChange={(_, value) => value && setViewMode(value)} sx={{ bgcolor: "background.paper", borderRadius: 2, p: 0.5, border: "1px solid", borderColor: "divider", ml: { md: "auto" }, "& .MuiToggleButton-root": { border: 0, borderRadius: 1.5, px: 1.5, fontWeight: 800 } }}>
            <ToggleButton value="LIST"><ViewListRoundedIcon sx={{ mr: 0.75 }} />Listă</ToggleButton>
            <ToggleButton value="COLUMNS"><ViewColumnRoundedIcon sx={{ mr: 0.75 }} />Kanban</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {viewMode === "COLUMNS" ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2, alignItems: "stretch" }}>
            {kanbanColumns.map((column) => (
              <Box key={column.key} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3, height: { xs: 560, lg: "calc(100vh - 250px)" }, minHeight: 420, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, bgcolor: "background.paper", position: "sticky", top: 0, zIndex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: column.color }} />
                    <Typography sx={{ fontWeight: 950 }}>{column.title}</Typography>
                  </Stack>
                  <Chip size="small" label={column.items.length} sx={{ fontWeight: 900 }} />
                </Stack>
                <Stack spacing={1.5} sx={{ p: 1.5, flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>
                  {column.items.map((task) => {
                    const priority = priorityInfo(task.priority);
                    const isDone = task.member_status === "DONE";
                    const isOverdue = apiDate(task.deadline).isBefore(dayjs()) && !isDone && task.status !== "CLOSED";
                    return (
                      <Card key={task.id} variant="outlined" onClick={() => nav(`/activities/${task.id}`)} sx={{ cursor: "pointer", borderRadius: 2, bgcolor: "background.default", flexShrink: 0, borderColor: isOverdue ? "error.main" : undefined, transition: "transform 140ms ease, border-color 140ms ease", "&:hover": { transform: "translateY(-1px)", borderColor: isOverdue ? "error.main" : accent.value } }}>
                        <CardContent sx={{ p: 2 }}>
                          <Typography sx={{ fontWeight: 950, mb: 1 }}>{task.title}</Typography>
                          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                            <Chip size="small" label={priority.label} sx={{ bgcolor: alpha(priority.color, 0.12), color: priority.color, border: `1px solid ${alpha(priority.color, 0.25)}`, fontWeight: 900 }} />
                            <Chip size="small" label={task.project_title} sx={{ fontWeight: 800 }} />
                            {task.parent_task_title ? <Chip size="small" label={task.parent_task_title} sx={{ fontWeight: 800 }} /> : null}
                          </Stack>
                          <Box sx={{ height: 4, borderRadius: 99, bgcolor: "divider", overflow: "hidden", mt: 1.5 }}>
                            <Box sx={{ width: isDone ? "100%" : task.member_status === "IN_PROGRESS" ? "55%" : "12%", height: "100%", bgcolor: column.color }} />
                          </Box>
                          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 1.25 }}>
                            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                              {isOverdue ? <WarningAmberRoundedIcon color="error" sx={{ fontSize: 16 }} /> : null}
                              <Typography sx={{ color: isOverdue ? "error.main" : "text.secondary", fontSize: 13, fontWeight: isOverdue ? 900 : 400 }}>{formatRoDate(apiDate(task.deadline), "DD MMM")}</Typography>
                            </Stack>
                            <FormControl size="small" onClick={(event) => event.stopPropagation()} sx={{ minWidth: 132 }}>
                              <Select value={task.member_status} onChange={(event) => void updateStatus(task.id, event.target.value as MemberStatus)} disabled={updatingId === task.id || task.status === "CLOSED"} sx={{ height: 28, fontWeight: 800, fontSize: 12 }}>
                                <MenuItem value="TODO">TODO</MenuItem>
                                <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                                <MenuItem value="DONE">DONE</MenuItem>
                              </Select>
                            </FormControl>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {column.items.length === 0 ? <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>Niciun task</Typography> : null}
                </Stack>
              </Box>
            ))}
          </Box>
        ) : (
        <Stack spacing={1.5}>
          {filtered.map((task) => {
            const priority = priorityInfo(task.priority);
            const isDone = task.member_status === "DONE";
            const isOverdue = apiDate(task.deadline).isBefore(dayjs()) && !isDone && task.status !== "CLOSED";
            return (
              <Card key={task.id} onClick={() => nav(`/activities/${task.id}`)} sx={{ cursor: "pointer", borderColor: isOverdue ? "error.main" : undefined, transition: "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease", "&:hover": { transform: "translateY(-1px)", borderColor: isOverdue ? "error.main" : accent.value, boxShadow: `0 16px 34px ${accent.value}20` } }}>
                <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                    <Box sx={{ pt: 0.3, color: isDone ? "success.main" : task.member_status === "IN_PROGRESS" ? "warning.main" : "text.secondary" }}>{statusIcon(task.member_status)}</Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 900 }}>{task.title}</Typography>
                      <Typography sx={{ color: "text.secondary", mt: 0.5 }} noWrap>{task.description?.trim() || task.project_title}</Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                        <Chip size="small" label={priority.label} sx={{ bgcolor: alpha(priority.color, 0.12), color: priority.color, border: `1px solid ${alpha(priority.color, 0.25)}`, fontWeight: 900 }} />
                        <Chip size="small" icon={<FolderRoundedIcon />} label={task.project_title} sx={{ fontWeight: 800 }} />
                        {task.parent_task_title ? <Chip size="small" icon={<AccountTreeRoundedIcon />} label={task.parent_task_title} sx={{ fontWeight: 800 }} /> : null}
                        <Chip size="small" icon={<AccessTimeRoundedIcon />} label={formatMinutes(task.assigned_minutes ?? task.estimate_minutes)} sx={{ fontWeight: 800 }} />
                        <Chip size="small" icon={isOverdue ? <WarningAmberRoundedIcon /> : <EventRoundedIcon />} label={formatRoDate(apiDate(task.deadline), "DD MMM YYYY")} color={isOverdue ? "error" : "default"} variant="outlined" sx={{ fontWeight: 800 }} />
                        <FormControl size="small" onClick={(event) => event.stopPropagation()} sx={{ minWidth: 150 }}>
                          <Select value={task.member_status} onChange={(event) => void updateStatus(task.id, event.target.value as MemberStatus)} disabled={updatingId === task.id || task.status === "CLOSED"} sx={{ height: 28, fontWeight: 800, fontSize: 13 }}>
                            <MenuItem value="TODO">TODO</MenuItem>
                            <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                            <MenuItem value="DONE">DONE</MenuItem>
                          </Select>
                        </FormControl>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 ? <Card><CardContent sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>Nu există activități pentru filtrul selectat.</CardContent></Card> : null}
        </Stack>
        )}
      </Stack>
    </AppLayout>
  );
}
