import { useCallback, useEffect, useMemo, useState } from "react";
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
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import dayjs, { Dayjs } from "dayjs";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { useAccentColor } from "../../hooks/useAccentColor";

type TaskStatus = "OPEN" | "IN_PROGRESS" | "READY_TO_CLOSE" | "CLOSED";
type MemberStatus = "TODO" | "IN_PROGRESS" | "DONE";

type TaskPublic = {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  parent_task_id: number | null;
  priority: number;
  estimate_minutes: number;
  deadline: string; // ISO
  status: TaskStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
};

type TaskCreate = {
  title: string;
  description?: string | null;
  parent_task_id?: number | null;
  priority: number;
  estimate_minutes: number;
  deadline: string; // ISO
};

type MemberItem = {
  user_id: number;
  name?: string | null;
  email?: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joined_at: string;
};

type MeResponse = {
  id: number;
  email: string;
  name?: string | null;
};

type AssignmentItem = {
  id: number;
  task_id: number;
  user_id: number;
  assigned_minutes: number | null;
  member_status: MemberStatus;
};

type SkillExtractionResponse = {
  task_id: number;
  document_count: number;
  applied: boolean;
  suggestions: {
    skill_id: number;
    name: string;
    confidence: number;
    reason: string;
    matched_term?: string | null;
  }[];
};

function formatMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}

function statusChipColor(status: TaskStatus): "default" | "success" | "warning" {
  if (status === "OPEN" || status === "IN_PROGRESS") return "warning";
  if (status === "READY_TO_CLOSE") return "success";
  return "default";
}

function statusChipLabel(status: TaskStatus) {
  if (status === "OPEN") return "OPEN";
  if (status === "IN_PROGRESS") return "IN PROGRESS";
  if (status === "READY_TO_CLOSE") return "READY";
  return "CLOSED";
}

function priorityMeta(priority: number) {
  if (priority >= 5) return { label: "Urgentă", color: "#DC2626", helper: "Se planifică înaintea taskurilor cu același deadline." };
  if (priority === 4) return { label: "Ridicată", color: "#D97706", helper: "Importantă, dar nu critică." };
  if (priority === 3) return { label: "Medie", color: "#0284C7" };
  return { label: "Scăzută", color: "#64748B", helper: "Poate fi planificată după taskurile urgente." };
}

export function TasksTab({ projectId }: { projectId: number }) {
  const accent = useAccentColor();
  const [items, setItems] = useState<TaskPublic[]>([]);
  const [assignmentsByTask, setAssignmentsByTask] = useState<Record<number, AssignmentItem[]>>({});
  const [membersById, setMembersById] = useState<Record<number, MemberItem>>({});
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extractingTaskId, setExtractingTaskId] = useState<number | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);
  const [actionsTask, setActionsTask] = useState<TaskPublic | null>(null);

  const [myRole, setMyRole] = useState<MemberItem["role"] | null>(null);
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskPublic | null>(null);

  // Form state (in dialog)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [priority, setPriority] = useState<number>(3);
  const [estimateMinutes, setEstimateMinutes] = useState<number>(60);
  const [deadline, setDeadline] = useState<Dayjs | null>(
    dayjs().add(3, "day").hour(21).minute(0).second(0)
  );

  const canSubmit = useMemo(() => {
    if (!canManage) return false;
    if (!title.trim()) return false;
    if (!deadline) return false;
    if (estimateMinutes <= 0) return false;
    if (priority < 1 || priority > 5) return false;
    return true;
  }, [canManage, title, deadline, estimateMinutes, priority]);

  function resetForm() {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setParentTaskId("");
    setPriority(3);
    setEstimateMinutes(60);
    setDeadline(dayjs().add(3, "day").hour(21).minute(0).second(0));
  }

  function openEditDialog(task: TaskPublic) {
    setActionsAnchor(null);
    setActionsTask(null);
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setParentTaskId(task.parent_task_id ? String(task.parent_task_id) : "");
    setPriority(task.priority);
    setEstimateMinutes(task.estimate_minutes);
    setDeadline(dayjs(task.deadline));
    setOpenDialog(true);
  }

  function openActions(event: React.MouseEvent<HTMLElement>, task: TaskPublic) {
    setActionsAnchor(event.currentTarget);
    setActionsTask(task);
  }

  function closeActions() {
    setActionsAnchor(null);
    setActionsTask(null);
  }

  const loadRole = useCallback(async () => {
    try {
      const meRes = await api.get<MeResponse>("/users/me");
      const membersRes = await api.get<MemberItem[]>(`/projects/${projectId}/members`);

      const meData = meRes.data;
      const members = membersRes.data;

      setMe(meData);
      setMembersById(Object.fromEntries(members.map((member) => [member.user_id, member])));

      const found = members.find((m) => m.user_id === meData.id);
      setMyRole(found?.role ?? null);
    } catch {
      setMe(null);
      setMembersById({});
      setMyRole(null);
    }
  }, [projectId]);

  const loadTasks = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<TaskPublic[]>(`/projects/${projectId}/tasks`);
      setItems(res.data);
      const assignmentPairs = await Promise.all(
        res.data.map(async (task) => {
          const assignmentRes = await api.get<AssignmentItem[]>(`/tasks/${task.id}/assignments`);
          return [task.id, assignmentRes.data] as const;
        })
      );
      setAssignmentsByTask(Object.fromEntries(assignmentPairs));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca task-urile"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  async function saveTask() {
    if (!canSubmit || !deadline) return;

    setError(null);
    setLoading(true);

    const payload: TaskCreate = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      parent_task_id: parentTaskId === "" ? null : Number(parentTaskId),
      priority,
      estimate_minutes: estimateMinutes,
      deadline: deadline.toISOString(),
    };

    try {
      if (editingTask) {
        await api.patch(`/tasks/${editingTask.id}`, payload);
      } else {
        await api.post(`/projects/${projectId}/tasks`, payload);
      }

      setOpenDialog(false);
      resetForm();
      await loadTasks();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, editingTask ? "Nu am putut actualiza task-ul" : "Nu am putut crea task-ul"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteTask(taskId: number) {
    if (!window.confirm("Sigur vrei să ștergi acest task? Vor fi șterse și asignările, dependențele și planificările asociate.")) return;
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      await loadTasks();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge task-ul"));
    } finally {
      setLoading(false);
    }
  }

  async function updateMyAssignmentStatus(taskId: number, status: MemberStatus) {
    if (!me) return;

    setError(null);
    setLoading(true);
    try {
      await api.patch(`/tasks/${taskId}/assignments/${me.id}`, { member_status: status });
      await loadTasks();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza statusul assignment-ului"));
    } finally {
      setLoading(false);
    }
  }

  async function extractSkills(taskId: number) {
    setError(null);
    setSuccess(null);
    setExtractingTaskId(taskId);
    try {
      const res = await api.post<SkillExtractionResponse>(`/tasks/${taskId}/skills/extract`, null, { params: { apply: true } });
      const names = res.data.suggestions.map((skill) => {
        const confidence = Math.round(skill.confidence * 100);
        const matchedTerm = skill.matched_term ? `, termen: ${skill.matched_term}` : "";
        return `${skill.name} (${confidence}%${matchedTerm})`;
      });
      setSuccess(
        names.length
          ? `Skilluri extrase. Potrivirile foarte sigure au fost aplicate automat: ${names.join(", ")}. Documente analizate: ${res.data.document_count}.`
          : `Nu am gasit skill-uri existente in descriere/documentele taskului. Documente analizate: ${res.data.document_count}.`
      );
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut extrage skill-urile pentru task"));
    } finally {
      setExtractingTaskId(null);
    }
  }

  useEffect(() => {
    void loadRole();
    void loadTasks();
  }, [loadRole, loadTasks]);

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="h6">Task-uri</Typography>

        <Stack direction="row" spacing={1}>
          {canManage && (
            <Button
              variant="contained"
              onClick={() => {
                resetForm();
                setOpenDialog(true);
              }}
              disabled={loading}
            >
              Creeaza task
            </Button>
          )}
          <Button variant="outlined" onClick={loadTasks} disabled={loading}>
            Reîncarcă
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {String(error)}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Doar OWNER/ADMIN poate crea task-uri. (Rolul tau: {myRole ?? "necunoscut"})
        </Alert>
      )}

      <Divider sx={{ mb: 2 }} />

      <Stack spacing={2}>
        {items.length === 0 && !loading && (
          <Typography sx={{ opacity: 0.75 }}>
            Nu există task-uri în acest proiect.
          </Typography>
        )}

        {items.map((t) => {
          const priority = priorityMeta(t.priority);
          const parentTask = t.parent_task_id ? items.find((item) => item.id === t.parent_task_id) : undefined;
          const assignments = assignmentsByTask[t.id] ?? [];
          const myAssignment = me ? assignments.find((assignment) => assignment.user_id === me.id) : undefined;

          return (
            <Card
              key={t.id}
              variant="outlined"
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                transition: "border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
                "&:hover": {
                  borderColor: alpha(accent.value, 0.45),
                  transform: "translateY(-1px)",
                },
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack
                  direction="column"
                  spacing={2}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 900 }} title={t.title}>
                        {t.title}
                      </Typography>
                      {t.description ? (
                        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, maxWidth: 860 }}>
                          {t.description}
                        </Typography>
                      ) : null}
                    </Box>
                    <Chip
                      size="small"
                      label={statusChipLabel(t.status)}
                      color={statusChipColor(t.status)}
                      variant="outlined"
                      sx={{ fontWeight: 900, flexShrink: 0 }}
                    />
                  </Stack>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        minWidth: 0,
                      }}
                    >
                      <Chip
                        icon={<FlagRoundedIcon />}
                        label={`Prioritate: P${t.priority} - ${priority.label}`}
                        sx={{
                          justifyContent: "flex-start",
                          bgcolor: alpha(priority.color, 0.12),
                          color: priority.color,
                          border: `1px solid ${alpha(priority.color, 0.25)}`,
                          fontWeight: 800,
                          "& .MuiChip-icon": { color: "inherit" },
                          maxWidth: "100%",
                        }}
                      />
                      {parentTask ? (
                        <Chip
                          label={`Subtask din: ${parentTask.title}`}
                          sx={{
                            justifyContent: "flex-start",
                            bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#38BDF8", 0.16) : "#E0F2FE"),
                            color: (theme) => (theme.palette.mode === "dark" ? "#BAE6FD" : "#0369A1"),
                            border: "1px solid",
                            borderColor: (theme) => (theme.palette.mode === "dark" ? "rgba(186,230,253,0.22)" : "rgba(3,105,161,0.20)"),
                            fontWeight: 800,
                            maxWidth: { xs: "100%", md: 360 },
                          }}
                        />
                      ) : null}
                      <Chip
                        icon={<ScheduleRoundedIcon />}
                        label={`Estimare: ${formatMinutes(t.estimate_minutes)}`}
                        sx={{
                          justifyContent: "flex-start",
                          bgcolor: alpha(accent.value, 0.12),
                          color: accent.text,
                          border: `1px solid ${alpha(accent.value, 0.25)}`,
                          fontWeight: 800,
                          "& .MuiChip-icon": { color: "inherit" },
                          maxWidth: "100%",
                        }}
                      />
                      <Chip
                        icon={<EventRoundedIcon />}
                        label={`Deadline: ${dayjs(t.deadline).format("DD MMM YYYY, HH:mm")}`}
                        sx={{
                          justifyContent: "flex-start",
                          bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#CBD5E1", 0.12) : alpha("#475569", 0.08)),
                          color: "text.secondary",
                          border: "1px solid",
                          borderColor: "divider",
                          fontWeight: 800,
                          "& .MuiChip-icon": { color: "inherit" },
                          maxWidth: "100%",
                        }}
                      />
                      {assignments.length > 0 ? (
                        <Chip
                          icon={<PersonOutlineRoundedIcon />}
                          label={`Asignat: ${assignments
                            .map((assignment) => {
                              const member = membersById[assignment.user_id];
                              return member?.name || member?.email || `User #${assignment.user_id}`;
                            })
                            .join(", ")}`}
                          sx={{
                            justifyContent: "flex-start",
                            bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#7E879F", 0.18) : "#F1F5F9"),
                            color: "text.secondary",
                            border: "1px solid",
                            borderColor: "divider",
                            fontWeight: 800,
                            "& .MuiChip-icon": { color: "inherit" },
                            maxWidth: { xs: "100%", md: 420 },
                          }}
                        />
                      ) : (
                        <Chip
                          icon={<PersonOutlineRoundedIcon />}
                          label="Neasignat"
                          sx={{
                            justifyContent: "flex-start",
                            bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#64748B", 0.16) : "#F8FAFC"),
                            color: "text.secondary",
                            border: "1px dashed",
                            borderColor: "divider",
                            fontWeight: 800,
                            "& .MuiChip-icon": { color: "inherit" },
                            maxWidth: "100%",
                          }}
                        />
                      )}

                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", ml: "auto" }}>
                        {myAssignment ? (
                          <FormControl size="small" sx={{ minWidth: 150, flexShrink: 0 }}>
                            <InputLabel id={`assignment-status-${t.id}`}>Statusul meu</InputLabel>
                            <Select
                              labelId={`assignment-status-${t.id}`}
                              label="Statusul meu"
                              value={myAssignment.member_status}
                              onChange={(event) => void updateMyAssignmentStatus(t.id, event.target.value as MemberStatus)}
                              disabled={loading}
                            >
                              <MenuItem value="TODO">TODO</MenuItem>
                              <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                              <MenuItem value="DONE">DONE</MenuItem>
                            </Select>
                          </FormControl>
                        ) : null}

                        {canManage ? (
                          <IconButton
                            onClick={(event) => openActions(event, t)}
                            aria-label="Actiuni task"
                            sx={{ border: "1px solid", borderColor: "divider", flexShrink: 0 }}
                          >
                            <MoreVertRoundedIcon />
                          </IconButton>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Menu anchorEl={actionsAnchor} open={Boolean(actionsAnchor)} onClose={closeActions}>
        <MenuItem
          disabled={!actionsTask || extractingTaskId === actionsTask.id}
          onClick={() => {
            if (!actionsTask) return;
            void extractSkills(actionsTask.id);
            closeActions();
          }}
        >
          <ListItemIcon><AutoAwesomeRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Extrage skill-uri</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!actionsTask) return;
            openEditDialog(actionsTask);
          }}
        >
          <ListItemIcon><EditRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Editeaza</ListItemText>
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            if (!actionsTask) return;
            const taskId = actionsTask.id;
            closeActions();
            void deleteTask(taskId);
          }}
        >
          <ListItemIcon sx={{ color: "inherit" }}><DeleteOutlineRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Sterge</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingTask ? "Editeaza task" : "Creeaza task"}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Titlu"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
            />

            <TextField
              label="Descriere (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={3}
            />

            <FormControl fullWidth>
              <InputLabel id="parent-task-label">Task părinte</InputLabel>
              <Select
                labelId="parent-task-label"
                label="Task părinte"
                value={parentTaskId}
                onChange={(event) => {
                  setParentTaskId(String(event.target.value));
                }}
              >
                <MenuItem value="">Fără părinte</MenuItem>
                {items
                  .filter((task) => !editingTask || task.id !== editingTask.id)
                  .map((task) => (
                    <MenuItem key={task.id} value={String(task.id)}>
                      {task.title}
                    </MenuItem>
                  ))}
              </Select>
              <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.75 }}>
                Alege un task părinte doar dacă activitatea curentă este o parte mai mică din acel task.
              </Typography>
            </FormControl>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id="priority-label">Prioritate</InputLabel>
                <Select
                  labelId="priority-label"
                  label="Prioritate"
                  value={priority}
                  onChange={(event) => setPriority(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((value) => {
                    const meta = priorityMeta(value);
                    return (
                      <MenuItem key={value} value={value}>
                        P{value} - {meta.label}
                      </MenuItem>
                    );
                  })}
                </Select>
                <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.75 }}>
                  Prioritatea ajută algoritmul să aleagă ordinea taskurilor când mai multe au deadline apropiat.
                </Typography>
              </FormControl>

              <TextField
                label="Estimare (minute)"
                type="number"
                value={estimateMinutes}
                onChange={(e) => setEstimateMinutes(Number(e.target.value))}
                slotProps={{ htmlInput: { min: 1 } }}
                fullWidth
              />
            </Stack>

            <Typography sx={{ color: "text.secondary", fontSize: 13, mt: -1 }}>
              P5 este cea mai urgentă, P1 cea mai puțin urgentă. Prioritatea nu înlocuiește deadline-ul, doar departajează taskuri similare.
            </Typography>

            <DateTimePicker
              label="Deadline"
              value={deadline}
              onChange={(v) => setDeadline(v)}
              slotProps={{
                textField: { fullWidth: true },
              }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setOpenDialog(false);
              resetForm();
            }}
          >
            Anuleaza
          </Button>
          <Button variant="contained" onClick={saveTask} disabled={!canSubmit || loading}>
            Salveaza
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
