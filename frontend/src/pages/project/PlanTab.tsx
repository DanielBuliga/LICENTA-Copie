import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import dayjs from "dayjs";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";

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

type GenerateResponse = {
  blocks_created: number;
  assignments_created: number;
  assignments_preserved: number;
  at_risk: { task_id: number; reason: string }[];
};

export function PlanTab({ projectId }: { projectId: number }) {
  const [startDay, setStartDay] = useState(dayjs().format("YYYY-MM-DD"));
  const [horizonDays, setHorizonDays] = useState(7);
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
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
      const res = await api.get<ScheduledBlock[]>(`/projects/${projectId}/plan`, {
        params: { from: dateRange.from, to: dateRange.to },
      });
      setBlocks(res.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca planul"));
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function updateStatus(blockId: number, block_status: ScheduledBlock["block_status"]) {
    setError(null);
    try {
      await api.patch(`/plan/blocks/${blockId}`, { block_status });
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza blocul"));
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
          {result.at_risk.length} task-uri at-risk.
        </Alert>
      ) : null}

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

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, gap: 2 }}>
        {blocks.map((block) => (
          <Card key={block.id}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1, mb: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>Task #{block.task_id}</Typography>
                <Chip label={block.block_status} size="small" color={block.block_status === "DONE" ? "success" : "default"} />
              </Stack>
              <Typography sx={{ color: "text.secondary" }}>User #{block.user_id}</Typography>
              <Typography sx={{ mt: 1 }}>
                {dayjs(block.start_datetime).format("DD.MM HH:mm")} - {dayjs(block.end_datetime).format("HH:mm")}
              </Typography>
              <Typography sx={{ color: "text.secondary" }}>{block.planned_minutes} minute planificate</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button size="small" variant="outlined" onClick={() => updateStatus(block.id, "DONE")}>
                  Done
                </Button>
                <Button size="small" variant="outlined" onClick={() => updateStatus(block.id, "SKIPPED")}>
                  Skipped
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>

      {blocks.length === 0 && !loading ? <Typography sx={{ color: "text.secondary" }}>Nu există blocuri planificate.</Typography> : null}
    </Stack>
  );
}
