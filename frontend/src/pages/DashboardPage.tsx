import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, Stack, Typography } from "@mui/material";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import FolderSpecialRoundedIcon from "@mui/icons-material/FolderSpecialRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ro";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import type { ProjectListItem, TaskPublic } from "../api/types";
import { AppLayout } from "../components/AppLayout";
import { GanttChart } from "../components/GanttChart";
import { useAccentColor } from "../hooks/useAccentColor";
import { useThemeMode } from "../themeMode";
import { apiDate } from "../utils/dateTime";

type MyTask = TaskPublic & { project_title: string; member_status: "TODO" | "IN_PROGRESS" | "DONE"; assigned_minutes: number | null };
type ProjectSummary = ProjectListItem & { tasks: TaskPublic[] };
type StatCardProps = { label: string; value: string | number; helper: string; color: string; icon: React.ReactNode };

function StatCard({ label, value, helper, color, icon }: StatCardProps) {
  return <Card><CardContent sx={{ p: 3 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}><Box><Typography sx={{ color: "text.secondary", fontWeight: 900, fontSize: 13, textTransform: "uppercase" }}>{label}</Typography><Typography sx={{ fontSize: 34, lineHeight: 1.15, fontWeight: 950, mt: 1 }}>{value}</Typography><Typography sx={{ color: "text.secondary", mt: 0.5 }}>{helper}</Typography></Box><Box sx={{ width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", color, bgcolor: `${color}18`, flex: "0 0 auto" }}>{icon}</Box></Stack></CardContent></Card>;
}

function priorityMeta(priority: number) {
  if (priority >= 5) return { label: "Urgent", color: "#E11D48", bg: "#FFE4EC" };
  if (priority >= 4) return { label: "Ridicat", color: "#F59E0B", bg: "#FFF3D8" };
  if (priority === 3) return { label: "Mediu", color: "#0284C7", bg: "#E0F2FE" };
  return { label: "Scăzut", color: "#64748B", bg: "#E2E8F0" };
}

function hours(minutes: number) { return `${Math.round(minutes / 60)}h`; }

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRoDate(value: Dayjs, format: string) {
  return capitalizeFirst(value.locale("ro").format(format));
}

function leafTasks(tasks: TaskPublic[]) {
  const parentIds = new Set(tasks.map((task) => task.parent_task_id).filter((id): id is number => id !== null));
  return tasks.filter((task) => !parentIds.has(task.id));
}

export function DashboardPage() {
  const navigate = useNavigate();
  const accent = useAccentColor();
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [activityStart, setActivityStart] = useState<Dayjs>(dayjs().subtract(6, "day").startOf("day"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [projectRes, myTasksRes] = await Promise.all([api.get<ProjectListItem[]>("/projects"), api.get<MyTask[]>("/users/me/tasks")]);
      const projectItems = projectRes.data;
      const taskResponses = await Promise.all(projectItems.map((project) => api.get<TaskPublic[]>(`/projects/${project.id}/tasks`)));
      setProjects(projectItems.map((project, index) => ({ ...project, tasks: taskResponses[index].data })));
      setMyTasks(myTasksRes.data);
    } catch (err: unknown) { setError(getApiErrorMessage(err, "Nu am putut încărca tabloul de bord")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const allTasks = projects.flatMap((project) => leafTasks(project.tasks));
    const personalTotal = myTasks.length;
    const personalClosed = myTasks.filter((task) => task.member_status === "DONE").length;
    const personalInProgress = myTasks.filter((task) => task.member_status === "IN_PROGRESS").length;
    const personalOverdue = myTasks.filter((task) => task.member_status !== "DONE" && apiDate(task.deadline).isBefore(dayjs())).length;
    const personalTodo = myTasks.filter((task) => task.member_status === "TODO").length;
    const personalEstimated = myTasks.reduce((sum, task) => sum + (task.assigned_minutes ?? task.estimate_minutes), 0);
    const personalDoneMinutes = myTasks.filter((task) => task.member_status === "DONE").reduce((sum, task) => sum + (task.assigned_minutes ?? task.estimate_minutes), 0);
    const personalRemaining = Math.max(personalEstimated - personalDoneMinutes, 0);
    const globalClosed = allTasks.filter((task) => task.status === "CLOSED").length;
    const globalReady = allTasks.filter((task) => task.status === "READY_TO_CLOSE").length;
    const globalOverdue = allTasks.filter((task) => task.status !== "CLOSED" && apiDate(task.deadline).isBefore(dayjs())).length;
    return { allTasks, personalTotal, personalClosed, personalInProgress, personalOverdue, personalTodo, personalEstimated, personalDoneMinutes, personalRemaining, globalClosed, globalReady, globalOverdue };
  }, [myTasks, projects]);

  const personalProgress = stats.personalTotal ? Math.round((stats.personalClosed / stats.personalTotal) * 100) : 0;
  const priorityCounts = [
    { label: "Urgente", value: myTasks.filter((task) => task.priority >= 5).length, color: "#E11D48" },
    { label: "Ridicate", value: myTasks.filter((task) => task.priority === 4).length, color: "#F59E0B" },
    { label: "Medii", value: myTasks.filter((task) => task.priority === 3).length, color: "#0284C7" },
    { label: "Scăzute", value: myTasks.filter((task) => task.priority <= 2).length, color: "#94A3B8" },
  ];
  const statusCounts = [
    { label: "De facut", value: stats.personalTodo, color: "#64748B" },
    { label: "În progres", value: stats.personalInProgress, color: "#3B82F6" },
    { label: "Finalizate", value: stats.personalClosed, color: "#22C55E" },
    { label: "Depășite", value: stats.personalOverdue, color: "#EF4444" },
  ];
  const urgentTasks = [...myTasks].filter((task) => task.member_status !== "DONE" && task.status !== "CLOSED").sort((a, b) => apiDate(a.deadline).valueOf() - apiDate(b.deadline).valueOf() || b.priority - a.priority).slice(0, 5);
  const activityDays = Array.from({ length: 7 }, (_, index) => activityStart.add(index, "day"));
  const completedActivity = activityDays.map((day) => {
    const tasks = myTasks.filter((task) => task.member_status === "DONE" && apiDate(task.updated_at).isSame(day, "day"));
    return { day, count: tasks.length, titles: tasks.map((task) => task.title) };
  });
  const totalCompletedActivity = completedActivity.reduce((sum, item) => sum + item.count, 0);
  const nextDeadline = urgentTasks[0] ?? null;
  const ganttTasks = projects.flatMap((project) =>
    leafTasks(project.tasks).map((task) => ({ ...task, project_title: project.title }))
  );

  return (
    <AppLayout title="Tablou de bord">
      <Stack spacing={3}>
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 2 }}>
          <Typography sx={{ fontSize: 30, fontWeight: 950 }}>Tablou de bord general</Typography>
          <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={() => window.print()}>Export Raport</Button>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {loading ? <LinearProgress /> : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
          <StatCard label="Proiecte" value={projects.length} helper="proiecte conectate" color={accent.value} icon={<FolderSpecialRoundedIcon />} />
          <StatCard label="Task-uri asignate" value={stats.personalTotal} helper={`${stats.personalClosed} închise · ${stats.personalInProgress} în progres`} color="#3B82F6" icon={<AssignmentTurnedInRoundedIcon />} />
          <StatCard label="Depășite" value={stats.personalOverdue} helper="task-uri personale cu deadline trecut" color="#EF4444" icon={<WarningAmberRoundedIcon />} />
          <StatCard label="Efort estimat" value={hours(stats.personalEstimated)} helper={`${hours(stats.personalDoneMinutes)} efectuate · ${hours(stats.personalRemaining)} rămase`} color="#8B5CF6" icon={<ScheduleRoundedIcon />} />
        </Box>

        <Card><CardContent sx={{ p: 3 }}><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 2, mb: 2 }}><Box><Typography variant="h6">Progres personal ({stats.personalTotal} task-uri)</Typography><Typography sx={{ color: "text.secondary" }}>{stats.personalClosed} finalizate, {stats.personalInProgress} în progres, {stats.personalTodo} de făcut.</Typography>{nextDeadline ? <Typography sx={{ color: "text.secondary", mt: 0.75 }}>Următorul deadline: <Box component="span" sx={{ fontWeight: 900, color: "text.primary" }}>{nextDeadline.title}</Box>, {formatRoDate(apiDate(nextDeadline.deadline), "DD MMM YYYY, HH:mm")}</Typography> : null}</Box><Typography sx={{ color: "text.primary", fontWeight: 950, fontSize: 30 }}>{personalProgress}%</Typography></Stack><LinearProgress variant="determinate" value={personalProgress} sx={{ height: 12, borderRadius: 99, bgcolor: "divider", "& .MuiLinearProgress-bar": { bgcolor: accent.value, borderRadius: 99 } }} /></CardContent></Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}><DistributionCard title="Distribuție după prioritate" rows={priorityCounts} total={Math.max(stats.personalTotal, 1)} /><DistributionCard title="Distribuție după status" rows={statusCounts} total={Math.max(stats.personalTotal, 1)} /></Box>

        <Card><CardContent sx={{ p: 3 }}><Typography variant="h6" sx={{ mb: 2 }}>Progres global pe proiecte</Typography><Stack spacing={2}>{projects.map((project) => { const projectLeafTasks = leafTasks(project.tasks); const total = projectLeafTasks.length; const closed = projectLeafTasks.filter((task) => task.status === "CLOSED").length; const overdue = projectLeafTasks.filter((task) => task.status !== "CLOSED" && apiDate(task.deadline).isBefore(dayjs())).length; const progress = total ? Math.round((closed / total) * 100) : 0; return <Box key={project.id} onClick={() => navigate(`/projects/${project.id}`)} sx={{ cursor: "pointer" }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.75, gap: 2 }}><Typography sx={{ fontWeight: 900 }}>{project.title} →</Typography><Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>{overdue ? <Chip size="small" color="error" label={`${overdue} depășite`} /> : null}<Typography sx={{ color: "text.secondary" }}>{closed}/{total}</Typography><Typography sx={{ color: "text.primary", fontWeight: 950 }}>{progress}%</Typography></Stack></Stack><Box sx={{ height: 10, borderRadius: 99, bgcolor: "divider", overflow: "hidden" }}><Box sx={{ width: `${progress}%`, height: "100%", bgcolor: progress === 100 ? "#111827" : accent.value }} /></Box></Box>; })}{projects.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Nu există proiecte.</Typography> : null}</Stack></CardContent></Card>

        <GanttChart
          title="Diagrama Gantt"
          subtitle="Toate proiectele, cu taskuri colorate distinctiv pe proiect."
          tasks={ganttTasks}
        />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          <Card><CardContent sx={{ p: 3 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}><Typography variant="h6">Cele mai urgente task-uri</Typography><Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate("/activities")}>Toate</Button></Stack><Stack spacing={1.5}>{urgentTasks.map((task) => { const meta = priorityMeta(task.priority); return <Box key={task.id} onClick={() => navigate(`/activities/${task.id}`)} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 1.5, alignItems: "center", p: 2, borderRadius: 2, cursor: "pointer", bgcolor: isDark ? "rgba(255,255,255,0.06)" : "#F8FAFC" }}><Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: meta.color }} /><Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 900 }}>{task.title}</Typography><Typography sx={{ color: "text.secondary", fontSize: 13 }}>{task.project_title} · {formatRoDate(apiDate(task.deadline), "DD MMM YYYY")}</Typography></Box><Chip size="small" label={meta.label} sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 900, border: `1px solid ${meta.color}40` }} /></Box>; })}{urgentTasks.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Nu există task-uri urgente.</Typography> : null}</Stack></CardContent></Card>

          <Card><CardContent sx={{ p: 3 }}><Stack direction="row" sx={{ alignItems: "center", gap: 1, mb: 2 }}><WarningAmberRoundedIcon sx={{ color: "#E11D48" }} /><Typography variant="h6">Monitorizare risc</Typography></Stack><Stack spacing={1.5}><Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? "rgba(225,29,72,0.14)" : "#FFF1F2" }}><Typography sx={{ color: "#BE123C", fontWeight: 900 }}>{stats.personalOverdue} deadline-uri personale depășite</Typography><Typography sx={{ color: isDark ? "#FDA4AF" : "#9F1239" }}>Task-uri asignate ție care necesită atenție.</Typography></Box><Box sx={{ p: 2, borderRadius: 2, bgcolor: isDark ? "rgba(96,165,250,0.14)" : "#EFF6FF" }}><Typography sx={{ color: isDark ? "#93C5FD" : "#1D4ED8", fontWeight: 900 }}>{stats.globalReady} task-uri gata de închidere</Typography><Typography sx={{ color: isDark ? "#BFDBFE" : "#1E40AF" }}>Pot fi analizate și închise de owner.</Typography></Box><Button variant="contained" onClick={() => navigate("/projects")}>Deschide proiectele</Button></Stack></CardContent></Card>
        </Box>

        <Card><CardContent sx={{ p: 3 }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.2fr) auto minmax(112px, 0.8fr)" }, alignItems: "center", mb: 2, gap: 2 }}><Box><Typography variant="h6">Task-uri finalizate în ultimele 7 zile</Typography><Typography sx={{ color: "text.secondary" }}>Task-urile personale marcate DONE în intervalul: <Box component="span" sx={{ color: "text.primary", fontWeight: 950 }}>{formatRoDate(activityDays[0], "DD MMM")} - {formatRoDate(activityDays[6], "DD MMM")}</Box>.</Typography></Box><Box sx={{ px: 2.25, py: 1.25, borderRadius: 2, bgcolor: accent.soft, color: accent.text, minWidth: 176, textAlign: "center", justifySelf: { xs: "center", md: "start" } }}><Typography sx={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>Total finalizate</Typography><Typography sx={{ fontSize: 26, fontWeight: 950, lineHeight: 1.1, textAlign: "center" }}>{totalCompletedActivity}</Typography></Box><Stack direction="row" spacing={1} sx={{ justifyContent: { xs: "center", md: "flex-end" } }}><IconButton onClick={() => setActivityStart((current) => current.subtract(7, "day"))}><ChevronLeftRoundedIcon /></IconButton><IconButton onClick={() => setActivityStart((current) => current.add(7, "day"))}><ChevronRightRoundedIcon /></IconButton></Stack></Box><CompletedActivityChart data={completedActivity} color={accent.value} textColor={isDark ? "#F8FAFC" : accent.text} /></CardContent></Card>
      </Stack>
    </AppLayout>
  );
}

function CompletedActivityChart({ data, color, textColor }: { data: { day: Dayjs; count: number; titles: string[] }[]; color: string; textColor: string }) {
  const rawMax = Math.max(...data.map((item) => item.count), 0);
  const maxValue = Math.max(2, Math.ceil(rawMax / 2) * 2);
  const width = 640;
  const height = 190;
  const padding = { top: 18, right: 20, bottom: 36, left: 36 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const points = data.map((item, index) => {
    const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index;
    const y = padding.top + chartHeight - (item.count / maxValue) * chartHeight;
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const gridValues = [maxValue, Math.floor(maxValue / 2), 0].filter((value, index, list) => list.indexOf(value) === index);

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart cu task-uri finalizate pe ultimele 7 zile" sx={{ width: "100%", minWidth: 560, display: "block" }}>
        {gridValues.map((value) => {
          const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
          return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" /><text x={padding.left - 9} y={y + 3} textAnchor="end" fill="currentColor" opacity="0.55" fontSize="9">{value}</text></g>;
        })}
        <polygon points={`${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`} fill={color} opacity="0.08" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => {
          const tooltip = `${formatRoDate(point.day, "DD MMM YYYY")}: ${point.count} task-uri finalizate${point.titles.length ? ` - ${point.titles.join(", ")}` : ""}`;
          return <g key={point.day.toISOString()}><title>{tooltip}</title><circle cx={point.x} cy={point.y} r="4.5" fill="white" stroke={color} strokeWidth="2.5" /><text x={point.x} y={point.y - 9} textAnchor="middle" fill={point.count ? textColor : "currentColor"} opacity={point.count ? 0.95 : 0.45} fontSize="9" fontWeight="800">{point.count}</text><text x={point.x} y={height - 20} textAnchor="middle" fill="currentColor" opacity="0.62" fontSize="9">{formatRoDate(point.day, "ddd")}</text><text x={point.x} y={height - 7} textAnchor="middle" fill="currentColor" opacity="0.55" fontSize="9">{point.day.format("DD")}</text></g>;
        })}
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ mt: 1, color: "text.secondary", alignItems: "center" }}><Box sx={{ width: 22, height: 3, borderRadius: 99, bgcolor: color }} /><Typography sx={{ fontSize: 12 }}>Axa verticală se scalează automat peste maximul din interval. Hover pe punct pentru task-urile finalizate în ziua respectivă.</Typography></Stack>
    </Box>
  );
}

function DistributionCard({ title, rows, total }: { title: string; rows: { label: string; value: number; color: string }[]; total: number }) {
  return <Card><CardContent sx={{ p: 3 }}><Typography variant="h6" sx={{ mb: 3 }}>{title}</Typography><Stack spacing={2}>{rows.map((item) => <Stack key={item.label} direction="row" spacing={2} sx={{ alignItems: "center" }}><Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: item.color }} /><Typography sx={{ flex: 1 }}>{item.label}</Typography><Typography sx={{ fontWeight: 900 }}>{item.value}</Typography><Box sx={{ width: 150, height: 8, borderRadius: 99, bgcolor: "divider", overflow: "hidden" }}><Box sx={{ width: `${Math.round((item.value / total) * 100)}%`, height: "100%", bgcolor: item.color }} /></Box></Stack>)}</Stack></CardContent></Card>;
}
