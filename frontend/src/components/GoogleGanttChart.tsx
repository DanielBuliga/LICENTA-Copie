import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { apiDate } from "../utils/dateTime";
import type { TaskPublic } from "../api/types";
import { getProjectColor } from "../utils/projectColors";

type GoogleDataValue = string | number | Date | null;
type GoogleDataRow = GoogleDataValue[];

type GoogleChartsApi = {
  charts: {
    load: (version: string, options: { packages: string[] }) => void;
    setOnLoadCallback: (callback: () => void) => void;
  };
  visualization: {
    DataTable: new () => {
      addColumn: (type: string, label: string) => void;
      addRows: (rows: GoogleDataRow[]) => void;
    };
    Gantt: new (element: HTMLElement) => {
      draw: (data: unknown, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleChartsApi;
  }
}

type DependencyItem = {
  predecessor_task_id: number;
  successor_task_id: number;
};

type Props = {
  projectId: number;
  projectTitle: string;
  tasks: TaskPublic[];
  dependencies: DependencyItem[];
};

let googleChartsPromise: Promise<void> | null = null;

function loadGoogleCharts() {
  if (window.google?.charts) return Promise.resolve();
  if (googleChartsPromise) return googleChartsPromise;

  googleChartsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.gstatic.com/charts/loader.js"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://www.gstatic.com/charts/loader.js";
    script.async = true;
    script.onload = () => {
      if (!window.google) {
        reject(new Error("Google Charts nu a putut fi iniÈ›ializat."));
        return;
      }
      window.google.charts.load("current", { packages: ["gantt"] });
      window.google.charts.setOnLoadCallback(resolve);
    };
    script.onerror = () => reject(new Error("Google Charts nu a putut fi încărcat."));
    if (!existing) document.head.appendChild(script);
  });

  return googleChartsPromise;
}

function asDate(value: string) {
  const parsed = apiDate(value);
  return parsed.isValid() ? parsed.toDate() : new Date();
}

function percentComplete(status: string) {
  if (status === "CLOSED") return 100;
  if (status === "READY_TO_CLOSE") return 90;
  if (status === "IN_PROGRESS") return 50;
  return 0;
}

function durationMinutes(task: TaskPublic) {
  return Math.max(15, task.estimate_minutes);
}

function projectPercent(tasks: TaskPublic[]) {
  if (!tasks.length) return 0;
  const total = tasks.reduce((sum, task) => sum + percentComplete(task.status), 0);
  return Math.round(total / tasks.length);
}

function buildVisualSchedule(tasks: TaskPublic[], dependencies: DependencyItem[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const predecessorIds = new Map<number, number[]>();

  dependencies.forEach((dependency) => {
    if (!tasksById.has(dependency.predecessor_task_id) || !tasksById.has(dependency.successor_task_id)) return;
    predecessorIds.set(dependency.successor_task_id, [
      ...(predecessorIds.get(dependency.successor_task_id) ?? []),
      dependency.predecessor_task_id,
    ]);
  });

  const memo = new Map<number, { start: Date; end: Date }>();
  const visiting = new Set<number>();

  function compute(task: TaskPublic): { start: Date; end: Date } {
    const cached = memo.get(task.id);
    if (cached) return cached;

    const deadline = apiDate(task.deadline);
    const estimateMinutes = durationMinutes(task);
    let start = apiDate(task.created_at).isValid() ? apiDate(task.created_at) : deadline.subtract(estimateMinutes, "minute");

    if (!visiting.has(task.id)) {
      visiting.add(task.id);
      for (const predecessorId of predecessorIds.get(task.id) ?? []) {
        const predecessor = tasksById.get(predecessorId);
        if (!predecessor) continue;
        const predecessorSchedule = compute(predecessor);
        const candidateStart = dayjs(predecessorSchedule.end);
        if (candidateStart.isAfter(start)) start = candidateStart;
      }
      visiting.delete(task.id);
    }

    const end = start.add(estimateMinutes, "minute");
    const value = { start: start.toDate(), end: end.toDate() };
    memo.set(task.id, value);
    return value;
  }

  tasks.forEach(compute);
  return memo;
}

export function GoogleGanttChart({ projectId, projectTitle, tasks, dependencies }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const color = getProjectColor(projectId);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const visualSchedule = useMemo(() => buildVisualSchedule(tasks, dependencies), [dependencies, tasks]);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      if (!ref.current) return;
      if (tasks.length === 0) {
        ref.current.innerHTML = "";
        return;
      }

      try {
        await loadGoogleCharts();
        if (cancelled || !ref.current || !window.google) return;

        const data = new window.google.visualization.DataTable();
        data.addColumn("string", "Task ID");
        data.addColumn("string", "Task Name");
        data.addColumn("string", "Resource");
        data.addColumn("date", "Start Date");
        data.addColumn("date", "End Date");
        data.addColumn("number", "Duration");
        data.addColumn("number", "Percent Complete");
        data.addColumn("string", "Dependencies");

        const predecessorByTask = new Map<number, string[]>();
        dependencies.forEach((dependency) => {
          if (!tasksById.has(dependency.predecessor_task_id) || !tasksById.has(dependency.successor_task_id)) return;
          const key = dependency.successor_task_id;
          predecessorByTask.set(key, [...(predecessorByTask.get(key) ?? []), `task-${dependency.predecessor_task_id}`]);
        });

        const schedules = tasks
          .map((task) => visualSchedule.get(task.id))
          .filter((schedule): schedule is { start: Date; end: Date } => Boolean(schedule));
        const projectStart = schedules.length
          ? new Date(Math.min(...schedules.map((schedule) => schedule.start.getTime())))
          : asDate(tasks[0]?.created_at ?? new Date().toISOString());
        const projectEnd = schedules.length
          ? new Date(Math.max(...schedules.map((schedule) => schedule.end.getTime())))
          : dayjs(projectStart).add(1, "hour").toDate();

        data.addRows([
          [
            `project-${projectId}`,
            `Proiect: ${projectTitle}`,
            "Proiect",
            projectStart,
            projectEnd,
            null,
            projectPercent(tasks),
            null,
          ],
          ...tasks.map((task) => {
            const schedule = visualSchedule.get(task.id);
            const start = schedule?.start ?? asDate(task.created_at);
            const end = schedule?.end ?? dayjs(start).add(durationMinutes(task), "minute").toDate();
            return [
              `task-${task.id}`,
              task.title,
              projectTitle,
              start < end ? start : dayjs(end).subtract(durationMinutes(task), "minute").toDate(),
              end,
              null,
              percentComplete(task.status),
              (predecessorByTask.get(task.id) ?? []).join(","),
            ];
          }),
        ]);

        const chart = new window.google.visualization.Gantt(ref.current);
        chart.draw(data, {
          height: Math.max(300, (tasks.length + 1) * 44 + 64),
          gantt: {
            trackHeight: 36,
            criticalPathEnabled: false,
            arrow: { angle: 45, width: 1, color: "#94A3B8", radius: 8 },
            labelStyle: {
              fontName: "Segoe UI",
              fontSize: 13,
              color: "#111827",
            },
            palette: [
              { color: "#334155", dark: "#0F172A", light: "#CBD5E1" },
              { color, dark: color, light: `${color}33` },
            ],
          },
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Diagrama Google Gantt nu a putut fi afișată.");
      }
    }

    void draw();
    window.addEventListener("resize", draw);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", draw);
    };
  }, [color, dependencies, projectId, projectTitle, tasks, tasksById, visualSchedule]);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography variant="h6">Diagrama Gantt a proiectului</Typography>
          <Typography sx={{ color: "text.secondary" }}>
            Variantă Google Charts Gantt, cu dependențe afișate discret între taskuri.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", pt: 1 }}>
            <Chip size="small" label={`${dependencies.length} relații de precedență`} sx={{ fontWeight: 800 }} />
            <Chip size="small" label="Durata taskului = estimarea în minute" sx={{ fontWeight: 800 }} />
            <Chip size="small" label="Bara de proiect agregă intervalul taskurilor" sx={{ fontWeight: 800 }} />
          </Stack>
        </Stack>
        {error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null}
        {tasks.length === 0 ? (
          <Typography sx={{ color: "text.secondary", py: 4, textAlign: "center" }}>Nu există task-uri pentru diagrama Gantt.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Box ref={ref} sx={{ minWidth: 760 }} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
