import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Stack, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import dayjs from "dayjs";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import type { ProjectDocument } from "./project/DocumentsTab";

type MyTask = { id: number; project_id: number; project_title: string; title: string; description: string | null; priority: number; estimate_minutes: number; deadline: string; status: string; member_status: string; assigned_minutes: number | null };

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function TaskDetailsPage() {
  const nav = useNavigate();
  const params = useParams();
  const taskId = Number(params.taskId);
  const [task, setTask] = useState<MyTask | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MyTask[]>("/users/me/tasks");
      const found = res.data.find((item) => item.id === taskId) ?? null;
      setTask(found);
      if (found) {
        const docs = await api.get<ProjectDocument[]>(`/projects/${found.project_id}/documents`, { params: { task_id: found.id } });
        setDocuments(docs.data);
      } else {
        setDocuments([]);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca detaliile task-ului"));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  async function openDocument(doc: ProjectDocument) {
    if (!doc.file_url) return;
    if (/^https?:\/\//i.test(doc.file_url)) {
      window.open(doc.file_url, "_blank", "noopener,noreferrer");
      return;
    }

    setError(null);
    try {
      const response = await api.get<Blob>(doc.file_url, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(response.data);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut deschide documentul"));
    }
  }

  const headerTitle = (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <IconButton onClick={() => nav("/activities")} aria-label="Înapoi la activități"><ArrowBackRoundedIcon /></IconButton>
      <Typography variant="h4">Detalii activitate</Typography>
    </Stack>
  );

  return (
    <AppLayout title={headerTitle}>
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {!loading && !task ? (
          <Card><CardContent sx={{ p: 4, textAlign: "center" }}><Typography variant="h6">Task-ul nu a fost găsit în activitățile tale.</Typography><Button sx={{ mt: 2 }} variant="contained" component={RouterLink} to="/activities">Înapoi la activități</Button></CardContent></Card>
        ) : null}

        {task ? (
          <>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 950 }}>{task.title}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                      <Chip icon={<FolderRoundedIcon />} label={task.project_title} sx={{ fontWeight: 800 }} />
                      <Chip label={`Status proiect: ${task.status}`} sx={{ fontWeight: 800 }} />
                      <Chip label={`Statusul meu: ${task.member_status}`} color={task.member_status === "DONE" ? "success" : "default"} sx={{ fontWeight: 800 }} />
                    </Stack>
                  </Box>
                  <Divider />
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ flexWrap: "wrap" }}>
                    <Chip label={`Prioritate P${task.priority}`} sx={{ fontWeight: 800 }} />
                    <Chip icon={<ScheduleRoundedIcon />} label={`Estimare: ${formatMinutes(task.estimate_minutes)}`} sx={{ fontWeight: 800 }} />
                    <Chip icon={<ScheduleRoundedIcon />} label={`Timp asignat: ${formatMinutes(task.assigned_minutes ?? task.estimate_minutes)}`} sx={{ fontWeight: 800 }} />
                    <Chip icon={<EventRoundedIcon />} label={`Deadline: ${dayjs(task.deadline).format("DD MMM YYYY, HH:mm")}`} color={dayjs(task.deadline).isBefore(dayjs()) && task.member_status !== "DONE" ? "error" : "default"} variant="outlined" sx={{ fontWeight: 800 }} />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}><DescriptionOutlinedIcon color="primary" /><Typography variant="h6">Descriere</Typography></Stack>
                <Typography sx={{ color: task.description ? "text.primary" : "text.secondary", whiteSpace: "pre-wrap" }}>{task.description?.trim() || "Nu există descriere pentru acest task."}</Typography>
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Documente atasate</Typography>
                <Stack spacing={1}>
                  {documents.map((doc) => (
                    <Stack key={doc.id} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "flex-start", sm: "center" }, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <InsertDriveFileOutlinedIcon sx={{ color: "text.secondary" }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 900 }}>{doc.file_name}</Typography>{doc.description ? <Typography sx={{ color: "text.secondary", fontSize: 14 }}>{doc.description}</Typography> : null}</Box>
                      {doc.file_url ? <Button onClick={() => void openDocument(doc)}>Deschide</Button> : null}
                    </Stack>
                  ))}
                  {documents.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Nu există documente atașate task-ului.</Typography> : null}
                </Stack>
              </CardContent>
            </Card>
          </>
        ) : null}
      </Stack>
    </AppLayout>
  );
}
