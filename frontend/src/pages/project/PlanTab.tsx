import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import dayjs from "dayjs";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { apiDate } from "../../utils/dateTime";

type ScheduledBlock = {
  id: number;
  project_id: number;
  task_id: number;
  user_id: number;
  start_datetime: string;
  end_datetime: string;
  planned_minutes: number;
  block_status: "PLANNED" | "DONE" | "SKIPPED";
};

type TaskItem = {
  id: number;
  title: string;
};

type MemberItem = {
  user_id: number;
  name?: string | null;
  email?: string | null;
  role: string;
};

type MeResponse = {
  id: number;
  email: string;
  name?: string | null;
};

type GenerateResponse = {
  blocks_created: number;
  assignments_created: number;
  assignments_preserved: number;
  at_risk: { task_id: number; reason: string }[];
};

export function PlanTab({ projectId }: { projectId: number }) {
  const [startDay, setStartDay] = useState(dayjs().format("YYYY-MM-DD"));
  const [calendarWeekStart, setCalendarWeekStart] = useState(dayjs().startOf("week").add(1, "day"));
  const [horizonDays, setHorizonDays] = useState(7);
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [tasksById, setTasksById] = useState<Record<number, TaskItem>>({});
  const [membersById, setMembersById] = useState<Record<number, MemberItem>>({});
  const [myRole, setMyRole] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [lastAction, setLastAction] = useState<"generate" | "replan" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const from = dayjs(startDay).startOf("day");
    return {
      from: from.toISOString(),
      to: from.add(horizonDays, "day").toISOString(),
    };
  }, [horizonDays, startDay]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, tasksRes, membersRes, meRes] = await Promise.all([
        api.get<ScheduledBlock[]>(`/projects/${projectId}/plan`, {
          params: { from: dateRange.from, to: dateRange.to },
        }),
        api.get<TaskItem[]>(`/projects/${projectId}/tasks`),
        api.get<MemberItem[]>(`/projects/${projectId}/members`),
        api.get<MeResponse>("/users/me"),
      ]);
      setBlocks(planRes.data);
      setTasksById(Object.fromEntries(tasksRes.data.map((task) => [task.id, task])));
      setMembersById(Object.fromEntries(membersRes.data.map((member) => [member.user_id, member])));
      const currentMember = membersRes.data.find((member) => member.user_id === meRes.data.id);
      setMyRole(currentMember?.role ?? null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca planul"));
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resultSummary = useMemo(() => {
    if (!result) return null;
    const affectedTaskCount = new Set(result.at_risk.map((item) => item.task_id)).size;
    const problemCount = result.at_risk.length;
    return { affectedTaskCount, problemCount };
  }, [result]);

  const canManagePlan = myRole === "OWNER" || myRole === "ADMIN";

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => calendarWeekStart.add(index, "day"));
  }, [calendarWeekStart]);

  const blocksForWeekDay = useMemo(() => {
    const grouped: Record<string, ScheduledBlock[]> = {};
    weekDays.forEach((day) => {
      const key = day.format("YYYY-MM-DD");
      grouped[key] = blocks
        .filter((block) => apiDate(block.start_datetime).isSame(day, "day"))
        .sort((a, b) => apiDate(a.start_datetime).valueOf() - apiDate(b.start_datetime).valueOf());
    });
    return grouped;
  }, [blocks, weekDays]);

  function scrollToPlanDay(dayKey: string) {
    const target = document.getElementById(`plan-day-${dayKey}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const blocksByDay = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => apiDate(a.start_datetime).valueOf() - apiDate(b.start_datetime).valueOf());
    const grouped: Record<string, ScheduledBlock[]> = {};
    sorted.forEach((block) => {
      const key = apiDate(block.start_datetime).format("YYYY-MM-DD");
      grouped[key] = [...(grouped[key] ?? []), block];
    });
    return Object.entries(grouped);
  }, [blocks]);

  async function runPlanner(mode: "generate" | "replan") {
    if (mode === "replan") {
      const confirmed = window.confirm(
        "Replanificarea va înlocui blocurile calendaristice din intervalul ales. Assignmenturile existente vor fi păstrate."
      );
      if (!confirmed) return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = mode === "generate"
        ? { start_day: startDay, horizon_days: horizonDays }
        : { today: startDay, horizon_days: horizonDays };
      const endpoint = mode === "generate"
        ? `/projects/${projectId}/plan/generate`
        : `/projects/${projectId}/plan/replan`;
      const res = await api.post<GenerateResponse>(endpoint, payload);
      setResult(res.data);
      setLastAction(mode);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, mode === "generate" ? "Nu am putut genera planul" : "Nu am putut replanifica"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      {loading ? <LinearProgress /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {result ? (
        <Alert severity={result.at_risk.length ? "warning" : "success"}>
          {lastAction === "replan" ? "Replanificare finalizată" : "Plan generat"}: {result.blocks_created} blocuri,{" "}
          {result.assignments_created} assignmenturi noi, {result.assignments_preserved} assignmenturi păstrate.{" "}
          {resultSummary?.affectedTaskCount
            ? `${resultSummary.affectedTaskCount} task-uri AT_RISK${resultSummary.problemCount !== resultSummary.affectedTaskCount ? `, ${resultSummary.problemCount} probleme detectate` : ""}.`
            : "0 probleme detectate."}
        </Alert>
      ) : null}

      {canManagePlan ? (
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", md: "center" } }}>
            <TextField
              label="Start"
              type="date"
              value={startDay}
              onChange={(event) => setStartDay(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Orizont zile"
              type="number"
              value={horizonDays}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 30 } }}
            />
            <Button variant="contained" startIcon={<AutoAwesomeRoundedIcon />} onClick={() => void runPlanner("generate")} disabled={loading}>
              Generează plan
            </Button>
            <Button variant="outlined" onClick={() => void runPlanner("replan")} disabled={loading}>
              Replanifică
            </Button>
            <Button variant="outlined" onClick={load} disabled={loading}>
              Reîncarcă
            </Button>
          </Stack>
        </CardContent>
      </Card>
      ) : (
        <Alert severity="info">
          Planul poate fi generat sau replanificat de owner/admin. Membrii pot consulta planul complet al echipei.
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Box>
              <Typography sx={{ fontWeight: 950 }}>Calendar săptămânal al proiectului</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                {weekDays[0].format("DD MMM")} - {weekDays[6].format("DD MMM YYYY")}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button variant="outlined" size="small" onClick={() => setCalendarWeekStart((current) => current.subtract(7, "day"))}>
                <ChevronLeftRoundedIcon />
              </Button>
              <Button variant="outlined" size="small" onClick={() => setCalendarWeekStart(dayjs().startOf("week").add(1, "day"))}>
                Azi
              </Button>
              <Button variant="outlined" size="small" onClick={() => setCalendarWeekStart((current) => current.add(7, "day"))}>
                <ChevronRightRoundedIcon />
              </Button>
              <Chip size="small" label={`${blocks.length} blocuri în interval`} sx={{ fontWeight: 900 }} />
            </Stack>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(7, 1fr)" },
            }}
          >
            {weekDays.map((day) => {
              const key = day.format("YYYY-MM-DD");
              const dayBlocks = blocksForWeekDay[key] ?? [];
              const isToday = day.isSame(dayjs(), "day");
              return (
                <Box
                  key={key}
                  sx={{
                    minHeight: 150,
                    p: 1.5,
                    borderRight: { lg: "1px solid" },
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: isToday ? "background.default" : "background.paper",
                  }}
                >
                  <Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                    {day.format("ddd")}
                  </Typography>
                  <Typography sx={{ fontWeight: 950, fontSize: 22, color: isToday ? "primary.main" : "text.primary" }}>
                    {day.format("D")}
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                    {dayBlocks.slice(0, 3).map((block) => {
                      const task = tasksById[block.task_id];
                      return (
                        <Box
                          key={block.id}
                          sx={{
                            p: 1,
                            borderRadius: 1.25,
                            bgcolor: "primary.lighter",
                            border: "1px solid",
                            borderColor: "primary.light",
                          }}
                        >
                          <Typography noWrap sx={{ fontWeight: 900, fontSize: 13 }}>{task?.title ?? `Task #${block.task_id}`}</Typography>
                          <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                            {apiDate(block.start_datetime).format("HH:mm")} - {apiDate(block.end_datetime).format("HH:mm")}
                          </Typography>
                        </Box>
                      );
                    })}
                    {dayBlocks.length === 0 ? (
                      <Typography sx={{ color: "text.disabled", textAlign: "center", pt: 3 }}>-</Typography>
                    ) : null}
                    {dayBlocks.length > 3 ? (
                      <Button
                        size="small"
                        onClick={() => scrollToPlanDay(key)}
                        sx={{ justifyContent: "flex-start", px: 0, fontSize: 12, fontWeight: 900 }}
                      >
                        +{dayBlocks.length - 3} blocuri
                      </Button>
                    ) : null}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={2}>
        {blocksByDay.map(([day, dayBlocks]) => (
          <Card key={day} id={`plan-day-${day}`}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 2.5, py: 2, bgcolor: "background.default", borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 950 }}>{apiDate(`${day}T00:00:00`).format("dddd, DD MMMM YYYY")}</Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{dayBlocks.length} blocuri planificate</Typography>
              </Box>
              <Stack divider={<Divider />}>
                {dayBlocks.map((block) => {
                  const task = tasksById[block.task_id];
                  const member = membersById[block.user_id];
                  const memberName = member?.name || member?.email || `User #${block.user_id}`;
                  return (
                    <Box
                      key={block.id}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "150px 1fr auto" },
                        gap: 2,
                        alignItems: "center",
                        px: 2.5,
                        py: 1.75,
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 950 }}>
                          {apiDate(block.start_datetime).format("HH:mm")} - {apiDate(block.end_datetime).format("HH:mm")}
                        </Typography>
                        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>{block.planned_minutes} min</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900 }}>{task?.title ?? `Task #${block.task_id}`}</Typography>
                        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                          <Chip size="small" icon={<PersonOutlineRoundedIcon />} label={memberName} sx={{ fontWeight: 800 }} />
                          <Chip size="small" icon={<ScheduleRoundedIcon />} label={`${block.planned_minutes} minute`} sx={{ fontWeight: 800 }} />
                        </Stack>
                      </Box>
                      <Chip
                        label={block.block_status}
                        size="small"
                        color={block.block_status === "DONE" ? "success" : block.block_status === "SKIPPED" ? "warning" : "default"}
                        sx={{ fontWeight: 900, justifySelf: { xs: "flex-start", md: "end" } }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {blocks.length === 0 && !loading ? <Typography sx={{ color: "text.secondary" }}>Nu există blocuri planificate.</Typography> : null}
    </Stack>
  );
}
