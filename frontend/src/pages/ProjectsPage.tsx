import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import type { ProjectCreate, ProjectListItem, TaskPublic } from "../api/types";
import { AppLayout } from "../components/AppLayout";

type MemberItem = { user_id: number; role: string; joined_at: string };
type ProjectCardItem = ProjectListItem & {
  tasks: TaskPublic[];
  members: MemberItem[];
};

export function ProjectsPage() {
  const nav = useNavigate();

  const [items, setItems] = useState<ProjectCardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await api.get<ProjectListItem[]>("/projects");
      const details = await Promise.all(
        res.data.map(async (project) => {
          const [tasksRes, membersRes] = await Promise.all([
            api.get<TaskPublic[]>(`/projects/${project.id}/tasks`),
            api.get<MemberItem[]>(`/projects/${project.id}/members`),
          ]);
          return { ...project, tasks: tasksRes.data, members: membersRes.data };
        })
      );
      setItems(details);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca proiectele"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openProject(id: number) {
    nav(`/projects/${id}`);
  }

  async function createProject() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const payload: ProjectCreate = {
      title: cleanTitle,
      description: description.trim() ? description.trim() : null,
    };

    setLoading(true);
    setError(null);
    try {
      const res = await api.post<ProjectListItem>("/projects", payload);
      setDialogOpen(false);
      setTitle("");
      setDescription("");
      await load();
      openProject(res.data.id);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut crea proiectul"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(projectId: number) {
    if (!window.confirm("Sigur vrei să ștergi acest proiect? Vor fi șterse și taskurile, planificările, documentele și mesajele asociate.")) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/projects/${projectId}`);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge proiectul"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout title="Proiecte" eyebrow="Management proiecte">
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 2 }}
        >
          <Box>
            <Typography sx={{ color: "text.secondary" }}>
              Organizeaza proiectele individuale si cele de echipa intr-un singur loc.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen(true)}>
            Proiect nou
          </Button>
        </Stack>

        {loading ? <LinearProgress /> : null}

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
          {items.map((project) => {
            const closed = project.tasks.filter((task) => task.status === "CLOSED").length;
            const total = project.tasks.length;
            const progress = total ? Math.round((closed / total) * 100) : 0;
            const nextDeadline = project.tasks
              .filter((task) => dayjs(task.deadline).isValid())
              .sort((a, b) => dayjs(b.deadline).valueOf() - dayjs(a.deadline).valueOf())[0]?.deadline;
            const isOwner = project.role === "OWNER";

            return (
            <Card
              key={project.id}
              onClick={() => openProject(project.id)}
              sx={{
                cursor: "pointer",
                transition: "transform 140ms ease, box-shadow 140ms ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 18px 42px rgba(17, 24, 39, 0.10)",
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" noWrap title={project.title}>
                      {project.title}
                    </Typography>
                    <Typography sx={{ color: "text.secondary", mt: 0.5 }} noWrap>
                      {project.description ?? "Proiect fara descriere."}
                    </Typography>
                  </Box>
                  <Chip label={project.role} size="small" color={isOwner ? "primary" : "default"} />
                </Stack>

                <Stack direction="row" sx={{ justifyContent: "space-between", mt: 2, mb: 0.75 }}>
                  <Typography sx={{ color: "text.secondary" }}>
                    {closed}/{total} task-uri
                  </Typography>
                  <Typography sx={{ fontWeight: 900 }}>{progress}%</Typography>
                </Stack>
                <Box sx={{ height: 8, borderRadius: 99, bgcolor: "#D9DDEA", overflow: "hidden" }}>
                  <Box sx={{ width: `${progress}%`, height: "100%", bgcolor: "primary.main" }} />
                </Box>

                <Stack direction="row" spacing={2} sx={{ color: "text.secondary", mt: 2, alignItems: "center" }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <GroupsRoundedIcon fontSize="small" />
                    <Typography>{project.members.length}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <EventRoundedIcon fontSize="small" />
                    <Typography>{nextDeadline ? dayjs(nextDeadline).format("DD MMM YYYY") : "fara deadline"}</Typography>
                  </Stack>
                </Stack>

                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mt: 2 }}>
                  {isOwner ? (
                    <Button
                      color="error"
                      startIcon={<DeleteOutlineRoundedIcon />}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteProject(project.id);
                      }}
                    >
                      Sterge
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
                    Deschide
                  </Button>
                </Stack>
              </CardContent>
            </Card>
            );
          })}
        </Box>

        {items.length === 0 && !loading ? (
          <Card>
            <CardContent sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="h6">Nu există proiecte încă</Typography>
              <Typography sx={{ color: "text.secondary", mt: 1, mb: 2 }}>
                Creeaza primul proiect pentru a adauga task-uri, membri si planificare automata.
              </Typography>
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen(true)}>
                Creeaza proiect
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Proiect nou</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Titlu"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Descriere"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Anuleaza</Button>
          <Button variant="contained" onClick={createProject} disabled={!title.trim() || loading}>
            Creeaza
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
}

