import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import dayjs from "dayjs";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import type { TaskPublic } from "../../api/types";
import { GoogleGanttChart } from "../../components/GoogleGanttChart";
import { useAccentColor } from "../../hooks/useAccentColor";

type ProjectMember = { user_id: number; name?: string | null; email?: string | null; role: string; status?: "ACTIVE" | "INACTIVE"; joined_at: string };
type DependencyItem = { predecessor_task_id: number; successor_task_id: number };
type Props = { projectId: number; projectTitle: string };

export function ProjectDashboardTab({ projectId, projectTitle }: Props) {
  const accent = useAccentColor();
  const [tasks, setTasks] = useState<TaskPublic[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [dependencies, setDependencies] = useState<DependencyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tasksRes, membersRes, depsRes] = await Promise.all([
        api.get<TaskPublic[]>(`/projects/${projectId}/tasks`),
        api.get<ProjectMember[]>(`/projects/${projectId}/members`),
        api.get<DependencyItem[]>(`/projects/${projectId}/dependencies`),
      ]);
      setTasks(tasksRes.data); setMembers(membersRes.data); setDependencies(depsRes.data);
    } catch (err: unknown) { setError(getApiErrorMessage(err, "Nu am putut încărca tabloul de bord al proiectului")); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const leafTasks = useMemo(() => {
    const parentIds = new Set(tasks.map((task) => task.parent_task_id).filter((id): id is number => id !== null));
    return tasks.filter((task) => !parentIds.has(task.id));
  }, [tasks]);

  const stats = useMemo(() => {
    const total = leafTasks.length;
    const closed = leafTasks.filter((task) => task.status === "CLOSED").length;
    const inProgress = leafTasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "READY_TO_CLOSE").length;
    const open = leafTasks.filter((task) => task.status === "OPEN").length;
    const overdue = leafTasks.filter((task) => dayjs(task.deadline).isBefore(dayjs()) && task.status !== "CLOSED").length;
    const progress = total ? Math.round((closed / total) * 100) : 0;
    const upcoming = [...leafTasks].filter((task) => task.status !== "CLOSED" && dayjs(task.deadline).isAfter(dayjs())).sort((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf()).slice(0, 5);
    return { total, closed, inProgress, open, overdue, progress, upcoming };
  }, [leafTasks]);

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 2 }}>
        <Box><Typography variant="h5" sx={{ fontWeight: 950 }}>Tablou de bord - {projectTitle}</Typography><Typography sx={{ color: "text.secondary" }}>Vizualizare generală proiect</Typography></Box>
        <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => window.print()}>Export PDF</Button>
      </Stack>
      {loading ? <LinearProgress /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Card><CardContent sx={{ p: 3 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}><Typography sx={{ fontWeight: 900 }}>Progres proiect</Typography><Typography variant="h4" sx={{ fontWeight: 950, color: accent.text }}>{stats.progress}%</Typography></Stack><Box sx={{ height: 12, bgcolor: "divider", borderRadius: 99, overflow: "hidden" }}><Box sx={{ width: `${stats.progress}%`, height: "100%", bgcolor: accent.value }} /></Box><Stack direction="row" spacing={2.5} sx={{ mt: 2, flexWrap: "wrap" }}><Typography><b>{stats.total}</b> total</Typography><Typography color="success.main"><b>{stats.closed}</b> închise</Typography><Typography color="primary.main"><b>{stats.inProgress}</b> în progres</Typography><Typography color="text.secondary"><b>{stats.open}</b> deschise</Typography></Stack></CardContent></Card>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}><Metric icon={<TaskAltRoundedIcon />} label="Taskuri închise" value={stats.closed} color="success.main" /><Metric icon={<TrendingUpRoundedIcon />} label="În progres" value={stats.inProgress} color="primary.main" /><Metric icon={<ReportProblemOutlinedIcon />} label="Deadline depășit" value={stats.overdue} color="error.main" /><Metric icon={<GroupOutlinedIcon />} label="Membri activi" value={members.filter((member) => member.status !== "INACTIVE").length} color="warning.main" /></Box>
      <GoogleGanttChart projectId={projectId} projectTitle={projectTitle} tasks={leafTasks} dependencies={dependencies} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Card><CardContent sx={{ p: 3, minHeight: 280 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}><EventRoundedIcon color="primary" /><Typography variant="h6">Taskuri sortate după deadline</Typography></Stack><Stack spacing={1.25}>{stats.upcoming.map((task) => <Stack key={task.id} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", p: 1.25, borderRadius: 2, bgcolor: "background.default" }}><Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 900 }}>{task.title}</Typography><Typography sx={{ color: "text.secondary", fontSize: 13 }}>{dayjs(task.deadline).format("DD MMM YYYY, HH:mm")}</Typography></Box><Chip size="small" label={task.status} /></Stack>)}{stats.upcoming.length === 0 ? <Typography sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>Niciun task cu deadline viitor</Typography> : null}</Stack></CardContent></Card>
        <Card><CardContent sx={{ p: 3, minHeight: 280 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}><TrendingUpRoundedIcon color="primary" /><Typography variant="h6">Distribuție taskuri</Typography></Stack><Stack spacing={2}>{[["Deschis", stats.open], ["În progres", stats.inProgress], ["Închis", stats.closed]].map(([label, value]) => <Box key={label}><Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.75 }}><Typography>{label}</Typography><Typography sx={{ fontWeight: 900 }}>{value}</Typography></Stack><Box sx={{ height: 10, borderRadius: 99, bgcolor: "divider", overflow: "hidden" }}><Box sx={{ width: `${stats.total ? (Number(value) / stats.total) * 100 : 0}%`, height: "100%", bgcolor: accent.value }} /></Box></Box>)}</Stack></CardContent></Card>
      </Box>
    </Stack>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return <Card><CardContent sx={{ p: 2.5 }}><Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}><Box sx={{ color }}>{icon}</Box><Box><Typography sx={{ color: "text.secondary", fontSize: 14 }}>{label}</Typography><Typography variant="h4" sx={{ fontWeight: 950, color }}>{value}</Typography></Box></Stack></CardContent></Card>;
}
