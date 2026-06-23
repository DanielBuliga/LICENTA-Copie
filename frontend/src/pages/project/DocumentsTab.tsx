import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { useConfirmDialog } from "../../components/useConfirmDialog";
import { openProjectDocument } from "./documentUtils";

export type ProjectDocument = {
  id: number;
  project_id: number;
  task_id: number | null;
  uploaded_by: number;
  file_name: string;
  file_url: string | null;
  description: string | null;
  created_at: string;
};

type TaskItem = {
  id: number;
  title: string;
};

export function ProjectDocumentsList({
  documents,
  onOpen,
  onDelete,
  taskTitlesById = {},
}: {
  documents: ProjectDocument[];
  onOpen: (doc: ProjectDocument) => void;
  onDelete?: (id: number) => void;
  taskTitlesById?: Record<number, string>;
}) {
  return (
    <Stack spacing={1.5}>
      {documents.map((doc) => (
        <Card key={doc.id} variant="outlined">
          <CardContent sx={{ p: 2.25 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1.5 }}>
              <Stack direction="row" spacing={1.25} sx={{ minWidth: 0 }}>
                <InsertDriveFileOutlinedIcon sx={{ color: "text.secondary" }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 900 }}>{doc.file_name}</Typography>
                  <Typography sx={{ color: "text.secondary", fontSize: 14 }}>{doc.description || "Fără descriere"}</Typography>
                  <Chip size="small" label={doc.task_id ? taskTitlesById[doc.task_id] ?? `Task șters #${doc.task_id}` : "Nivel proiect"} sx={{ mt: 1, fontWeight: 800 }} />
                </Box>
              </Stack>
              <Stack direction="row" spacing={1}>
                {doc.file_url ? (
                  <Button onClick={() => onOpen(doc)} startIcon={<OpenInNewRoundedIcon />}>
                    Deschide
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => onDelete(doc.id)}>
                    Șterge
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
      {documents.length === 0 ? (
        <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>Niciun document.</Typography>
      ) : null}
    </Stack>
  );
}

export function DocumentsTab({ projectId, projectOnly = false }: { projectId: number; projectOnly?: boolean }) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskId, setTaskId] = useState("project");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [filter, setFilter] = useState(projectOnly ? "project" : "all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsRes, tasksRes] = await Promise.all([
        api.get<ProjectDocument[]>(`/projects/${projectId}/documents`),
        api.get<TaskItem[]>(`/projects/${projectId}/tasks`),
      ]);
      setDocuments(docsRes.data);
      setTasks(tasksRes.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca documentele"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function addDocument() {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    try {
      const attachedTaskId = projectOnly || taskId === "project" ? null : Number(taskId);
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (description.trim()) formData.append("description", description.trim());
      if (attachedTaskId !== null) formData.append("task_id", String(attachedTaskId));
      await api.post(`/projects/${projectId}/documents/upload`, formData);
      setSelectedFile(null);
      setDescription("");
      setTaskId("project");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut adauga documentul"));
    } finally {
      setLoading(false);
    }
  }

  async function openDocument(doc: ProjectDocument) {
    setError(null);
    await openProjectDocument(doc, setError);
  }

  async function deleteDocument(id: number) {
    const confirmed = await confirm({
      title: "Ștergere document",
      description: "Sigur vrei să ștergi acest document?",
      confirmLabel: "Șterge documentul",
    });
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/documents/${id}`);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge documentul"));
    } finally {
      setLoading(false);
    }
  }

  const visibleDocuments = documents.filter((doc) => {
    if (projectOnly || filter === "project") return doc.task_id === null;
    if (filter === "all") return true;
    return doc.task_id === Number(filter);
  });
  const taskTitlesById = Object.fromEntries(tasks.map((task) => [task.id, task.title]));

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
            <UploadFileRoundedIcon sx={{ fontSize: 46, color: "text.secondary", opacity: 0.55 }} />
            <Typography sx={{ color: "text.secondary" }}>Încarcă fișiere pentru proiect sau task-uri.</Typography>
            {loading ? <LinearProgress sx={{ width: "100%" }} /> : null}

            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ width: "100%" }}>
              {!projectOnly ? (
                <TextField select label="Ataseaza la" value={taskId} onChange={(event) => setTaskId(event.target.value)} sx={{ minWidth: 210 }}>
                  <MenuItem value="project">Nivel proiect</MenuItem>
                  {tasks.map((task) => (
                    <MenuItem key={task.id} value={String(task.id)}>
                      {task.title}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />} sx={{ minWidth: 210 }}>
                Alege fișier
                <input hidden type="file" onChange={onFileChange} />
              </Button>
              <TextField label="Fișier selectat" value={selectedFile?.name ?? ""} fullWidth disabled placeholder="Niciun fișier selectat" />
              <TextField label="Descriere" value={description} onChange={(event) => setDescription(event.target.value)} fullWidth />
            </Stack>

            <Button variant="contained" startIcon={<UploadFileRoundedIcon />} onClick={addDocument} disabled={!selectedFile || loading}>
              Încarcă fișier
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {!projectOnly ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography sx={{ color: "text.secondary" }}>{visibleDocuments.length} documente</Typography>
          <TextField select size="small" value={filter} onChange={(event) => setFilter(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="all">Toate documentele</MenuItem>
            <MenuItem value="project">Nivel proiect</MenuItem>
            {tasks.map((task) => (
              <MenuItem key={task.id} value={String(task.id)}>
                {task.title}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      ) : null}

      <ProjectDocumentsList
        documents={visibleDocuments}
        taskTitlesById={taskTitlesById}
        onOpen={(doc) => void openDocument(doc)}
        onDelete={(id) => void deleteDocument(id)}
      />
      {confirmDialog}
    </Stack>
  );
}
