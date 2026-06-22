import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import type { ProjectCreate, ProjectListItem, TaskPublic } from "../api/types";
import { AppLayout } from "../components/AppLayout";
import { apiDate } from "../utils/dateTime";

type MemberItem = { user_id: number; role: string; status?: "ACTIVE" | "INACTIVE"; joined_at: string };
type ProjectCardItem = ProjectListItem & {
  tasks: TaskPublic[];
  members: MemberItem[];
};
type NotificationItem = {
  id: number;
  type: string;
  project_id: number | null;
  is_read: boolean;
};

export function ProjectsPage() {
  const nav = useNavigate();

  const [items, setItems] = useState<ProjectCardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unreadMessagesByProject, setUnreadMessagesByProject] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await api.get<ProjectListItem[]>("/projects");
      const [details, notificationsRes] = await Promise.all([
        Promise.all(
          res.data.map(async (project) => {
            const [tasksRes, membersRes] = await Promise.all([
              api.get<TaskPublic[]>(`/projects/${project.id}/tasks`),
              api.get<MemberItem[]>(`/projects/${project.id}/members`),
            ]);
            return { ...project, tasks: tasksRes.data, members: membersRes.data };
          })
        ),
        api.get<NotificationItem[]>("/notifications", { params: { unread_only: true } }),
      ]);
      const unreadMessageCounts: Record<number, number> = {};
      notificationsRes.data
        .filter((notification) => notification.type === "PROJECT_MESSAGE" && notification.project_id !== null && !notification.is_read)
        .forEach((notification) => {
          const projectId = Number(notification.project_id);
          unreadMessageCounts[projectId] = (unreadMessageCounts[projectId] ?? 0) + 1;
        });
      setItems(details);
      setUnreadMessagesByProject(unreadMessageCounts);
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
    setDialogError(null);
    try {
      const res = await api.post<ProjectListItem>("/projects", payload);
      setDialogOpen(false);
      setDialogError(null);
      setTitle("");
      setDescription("");
      await load();
      openProject(res.data.id);
    } catch (err: unknown) {
      setDialogError(getApiErrorMessage(err, "Nu am putut crea proiectul."));
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
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => {
              setDialogError(null);
              setDialogOpen(true);
            }}
          >
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
            const isCompleted = total > 0 && closed === total;
            const nextDeadline = project.tasks
              .filter((task) => apiDate(task.deadline).isValid())
              .sort((a, b) => apiDate(b.deadline).valueOf() - apiDate(a.deadline).valueOf())[0]?.deadline;
            const isOwner = project.role === "OWNER";
            const unreadMessages = unreadMessagesByProject[project.id] ?? 0;

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
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
                    {isCompleted ? <Chip label="Finalizat" size="small" color="success" sx={{ fontWeight: 900 }} /> : null}
                    <Chip label={project.role} size="small" color={isOwner ? "primary" : "default"} />
                  </Stack>
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
                    <Typography>{project.members.filter((member) => member.status !== "INACTIVE").length}</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <EventRoundedIcon fontSize="small" />
                    <Typography>{nextDeadline ? apiDate(nextDeadline).format("DD MMM YYYY") : "fara deadline"}</Typography>
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
                  <Stack direction="row" spacing={4} sx={{ alignItems: "center" }}>
                    <Tooltip title={unreadMessages ? `${unreadMessages} mesaje necitite` : "Deschide chatul proiectului"}>
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          nav(`/messages?projectId=${project.id}`);
                        }}
                        aria-label="Deschide chatul proiectului"
                        sx={{ border: "1px solid", borderColor: "divider" }}
                      >
                        <Badge badgeContent={unreadMessages} color="error" max={99}>
                          <ChatBubbleOutlineRoundedIcon fontSize="small" />
                        </Badge>
                      </IconButton>
                    </Tooltip>
                    <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
                      Deschide
                    </Button>
                  </Stack>
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
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={() => {
                  setDialogError(null);
                  setDialogOpen(true);
                }}
              >
                Creeaza proiect
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Proiect nou</DialogTitle>
        {dialogError ? (
          <Box sx={{ px: 3, pb: 1 }}>
            <Alert severity="error" onClose={() => setDialogError(null)}>
              {dialogError}
            </Alert>
          </Box>
        ) : null}
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
          <Button
            onClick={() => {
              setDialogOpen(false);
              setDialogError(null);
            }}
          >
            Anuleaza
          </Button>
          <Button variant="contained" onClick={createProject} disabled={!title.trim() || loading}>
            Creeaza
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
}

