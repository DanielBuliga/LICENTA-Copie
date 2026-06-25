import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, FormControl, LinearProgress, MenuItem, Select, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import dayjs, { Dayjs } from "dayjs";
import "dayjs/locale/ro";
import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import type { ProjectListItem, TaskPublic } from "../api/types";
import { AppLayout } from "../components/AppLayout";
import { useAccentColor } from "../hooks/useAccentColor";
import { useThemeMode } from "../themeMode";
import { apiDate } from "../utils/dateTime";
import { getProjectColor } from "../utils/projectColors";

type CurrentUser = { id: number; email: string; name: string };
type ScheduledBlock = { id: number; project_id: number; task_id: number; user_id: number; start_datetime: string; end_datetime: string; planned_minutes: number; block_status: string };
type CalendarBlock = ScheduledBlock & { projectTitle: string; taskTitle: string; taskStatus: string; userLabel: string };
type CalendarTaskItem = CalendarBlock & { blockCount: number; totalMinutes: number };

function monthDays(month: Dayjs) { const start = month.startOf("month").startOf("week").add(1, "day"); return Array.from({ length: 42 }, (_, index) => start.add(index, "day")); }
function escapeIcs(text: string) { return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; if (!h) return `${m} min`; return m ? `${h}h ${m}m` : `${h}h`; }
function capitalizeFirst(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatRoDate(value: Dayjs, format: string) { return capitalizeFirst(value.locale("ro").format(format)); }
function statusDot(status: string) {
  if (status === "CLOSED") return { color: "#22C55E", label: "Închis" };
  if (status === "READY_TO_CLOSE") return { color: "#0EA5E9", label: "Gata de verificare" };
  if (status === "IN_PROGRESS") return { color: "#3B82F6", label: "În progres" };
  return null;
}
function taskItemsForDay(blocks: CalendarBlock[], day: Dayjs): CalendarTaskItem[] {
  const grouped = new Map<string, CalendarTaskItem>();
  blocks.filter((block) => apiDate(block.start_datetime).isSame(day, "day")).forEach((block) => {
    const key = `${block.project_id}-${block.task_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.blockCount += 1;
      existing.totalMinutes += block.planned_minutes;
      if (apiDate(block.start_datetime).isBefore(apiDate(existing.start_datetime))) {
        existing.start_datetime = block.start_datetime;
      }
      if (apiDate(block.end_datetime).isAfter(apiDate(existing.end_datetime))) {
        existing.end_datetime = block.end_datetime;
      }
      return;
    }
    grouped.set(key, { ...block, blockCount: 1, totalMinutes: block.planned_minutes });
  });
  return Array.from(grouped.values()).sort((a, b) => apiDate(a.start_datetime).valueOf() - apiDate(b.start_datetime).valueOf());
}

export function CalendarPage() {
  const accent = useAccentColor();
  const nav = useNavigate();
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const [month, setMonth] = useState(dayjs().startOf("month"));
  const [selectedDay, setSelectedDay] = useState(dayjs());
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "ALL">("ALL");
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => { const days = monthDays(month); return { from: days[0].startOf("day").toISOString(), to: days[41].endOf("day").toISOString() }; }, [month]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [meRes, projectsRes] = await Promise.all([api.get<CurrentUser>("/users/me"), api.get<ProjectListItem[]>("/projects")]);
      const me = meRes.data;
      const userLabel = me.name || me.email || `User ${me.id}`;
      const projectItems = projectsRes.data;
      setProjects(projectItems);
      const visibleProjects = selectedProjectId === "ALL" ? projectItems : projectItems.filter((project) => project.id === selectedProjectId);
      const blocksByProject = await Promise.all(visibleProjects.map(async (project) => {
        const params = { from: range.from, to: range.to, user_id: me.id };
        const [planRes, tasksRes] = await Promise.all([api.get<ScheduledBlock[]>(`/projects/${project.id}/plan`, { params }), api.get<TaskPublic[]>(`/projects/${project.id}/tasks`)]);
        const taskById = new Map(tasksRes.data.map((task) => [task.id, task]));
        return planRes.data.map((block) => {
          const task = taskById.get(block.task_id);
          return { ...block, projectTitle: project.title, taskTitle: task?.title ?? `Task #${block.task_id}`, taskStatus: task?.status ?? "UNKNOWN", userLabel };
        });
      }));
      setBlocks(blocksByProject.flat());
    } catch (err: unknown) { setError(getApiErrorMessage(err, "Nu am putut încărca calendarul")); }
    finally { setLoading(false); }
  }, [range.from, range.to, selectedProjectId]);

  useEffect(() => { void load(); }, [load]);

  const visibleBlocks = useMemo(() => blocks.filter((block) => block.taskStatus !== "CLOSED"), [blocks]);
  const days = monthDays(month);
  const tasksForSelectedDay = taskItemsForDay(visibleBlocks, selectedDay);

  function exportIcs() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Smart Planner//RO", "CALSCALE:GREGORIAN"];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    visibleBlocks.filter((block) => !["READY_TO_CLOSE", "CLOSED"].includes(block.taskStatus)).forEach((block) => { lines.push("BEGIN:VEVENT"); lines.push(`UID:block-${block.id}@smart-planner`); lines.push(`DTSTAMP:${stamp}`); lines.push(`DTSTART:${apiDate(block.start_datetime).format("YYYYMMDDTHHmmss")}`); lines.push(`DTEND:${apiDate(block.end_datetime).format("YYYYMMDDTHHmmss")}`); lines.push(`SUMMARY:${escapeIcs(block.taskTitle)}`); lines.push(`DESCRIPTION:${escapeIcs(`Proiect: ${block.projectTitle}\nTask: ${block.taskTitle}\nResponsabil: ${block.userLabel}\nStatus bloc: ${block.block_status}\nStatus task: ${block.taskStatus}`)}`); lines.push("END:VEVENT"); });
    lines.push("END:VCALENDAR");
    const blob = new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `calendar_plan_${dayjs().format("YYYYMMDD_HHmm")}.ics`; link.click(); URL.revokeObjectURL(url);
  }

  function goToday() { const today = dayjs(); setMonth(today.startOf("month")); setSelectedDay(today); }

  return (
    <AppLayout title="Calendar">
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="outlined" onClick={() => setMonth((current) => current.subtract(1, "month"))}><ChevronLeftRoundedIcon /></Button>
            <Typography variant="h6" sx={{ minWidth: 160, textAlign: "center" }}>{formatRoDate(month, "MMMM YYYY")}</Typography>
            <Button variant="outlined" onClick={() => setMonth((current) => current.add(1, "month"))}><ChevronRightRoundedIcon /></Button>
            <Button variant="outlined" onClick={goToday}>Azi</Button>
            <FormControl size="small" sx={{ minWidth: 220 }}><Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value as number | "ALL")} sx={{ bgcolor: "background.paper", borderRadius: 2, fontWeight: 800 }}><MenuItem value="ALL">Toate proiectele</MenuItem>{projects.map((project) => <MenuItem key={project.id} value={project.id}>{project.title}</MenuItem>)}</Select></FormControl>
          </Stack>
          <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={exportIcs}>Export ICS</Button>
        </Stack>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.6fr 1fr" }, gap: 2 }}>
          <Card><CardContent sx={{ p: 0 }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid", borderColor: "divider" }}>{["LUN", "MAR", "MIE", "JOI", "VIN", "SÂM", "DUM"].map((day) => <Typography key={day} sx={{ p: 2, color: "text.secondary", fontWeight: 900, textAlign: "center" }}>{day}</Typography>)}</Box><Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>{days.map((day) => { const dayTasks = taskItemsForDay(visibleBlocks, day); const selected = day.isSame(selectedDay, "day"); return <Box key={day.toISOString()} onClick={() => setSelectedDay(day)} sx={{ minHeight: 120, minWidth: 0, p: 1.25, borderRight: "1px solid", borderBottom: "1px solid", borderColor: "divider", cursor: "pointer", bgcolor: selected ? isDark ? "rgba(255,255,255,0.08)" : accent.soft : "transparent", outline: selected ? `2px solid ${accent.value}` : "none", outlineOffset: "-2px" }}><Typography sx={{ fontWeight: 900, color: selected ? isDark ? "#FFFFFF" : accent.text : day.month() === month.month() ? "text.primary" : "text.disabled" }}>{day.date()}</Typography><Stack spacing={0.5} sx={{ mt: 1, minWidth: 0 }}>{dayTasks.slice(0, 3).map((item) => { const color = getProjectColor(item.project_id); return <Chip key={`${item.project_id}-${item.task_id}`} size="small" label={item.taskTitle} sx={{ justifyContent: "flex-start", bgcolor: alpha(color, 0.14), color, border: `1px solid ${alpha(color, 0.22)}`, fontWeight: 850, width: "100%", minWidth: 0, maxWidth: "100%", "& .MuiChip-label": { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }} />; })}{dayTasks.length > 3 ? <Typography sx={{ fontSize: 12, color: "text.secondary" }}>+{dayTasks.length - 3} task-uri</Typography> : null}</Stack></Box>; })}</Box></CardContent></Card>
          <Card>
            <CardContent sx={{ p: 3, height: { lg: 640 }, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Typography variant="h6">{formatRoDate(selectedDay, "dddd, DD MMMM")}</Typography>
              <Typography sx={{ color: "text.secondary", mb: 2 }}>{tasksForSelectedDay.length} task-uri planificate</Typography>
              <Stack spacing={1.5} sx={{ overflowY: "auto", pr: 0.5, flex: 1, minHeight: 0, overscrollBehavior: "contain" }}>
                {tasksForSelectedDay.map((item) => {
                  const color = getProjectColor(item.project_id);
                  const status = statusDot(item.taskStatus);
                  return (
                    <Box
                      key={`${item.project_id}-${item.task_id}`}
                      onClick={() => nav(`/activities/${item.task_id}`)}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: alpha(color, isDark ? 0.16 : 0.08),
                        border: `1px solid ${alpha(color, 0.22)}`,
                        cursor: "pointer",
                        transition: "border-color 140ms ease, box-shadow 140ms ease",
                        "&:hover": { borderColor: color, boxShadow: `0 10px 24px ${alpha(color, 0.16)}` },
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flex: "0 0 auto" }} />
                        <Typography noWrap title={item.taskTitle} sx={{ fontWeight: 950, minWidth: 0, flex: 1 }}>
                          {item.taskTitle}
                        </Typography>
                      </Stack>
                      <Typography noWrap title={item.projectTitle} sx={{ color: "text.secondary" }}>{item.projectTitle}</Typography>
                      <Typography sx={{ mt: 1, color: "text.secondary", fontSize: 14 }}>
                        {formatMinutes(item.totalMinutes)} planificate · {item.blockCount} bloc{item.blockCount === 1 ? "" : "uri"} · {apiDate(item.start_datetime).format("HH:mm")} - {apiDate(item.end_datetime).format("HH:mm")}
                      </Typography>
                      {status ? (
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 1 }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: status.color }} />
                          <Typography sx={{ color: "text.secondary", fontSize: 13, fontWeight: 800 }}>{status.label}</Typography>
                        </Stack>
                      ) : null}
                    </Box>
                  );
                })}
                {tasksForSelectedDay.length === 0 ? <Typography sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>Niciun task planificat</Typography> : null}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </AppLayout>
  );
}

