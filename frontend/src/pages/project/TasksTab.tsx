import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import dayjs, { Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { useConfirmDialog } from "../../components/useConfirmDialog";
import { useAccentColor } from "../../hooks/useAccentColor";
import { apiDate } from "../../utils/dateTime";

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
  status?: "ACTIVE" | "INACTIVE";
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

type TaskNode = TaskPublic & {
  depth: number;
  hasChildren: boolean;
  aggregateEstimateMinutes: number;
  aggregateDeadline: string;
};

export function TasksTab({ projectId }: { projectId: number }) {
  const accent = useAccentColor();
  const nav = useNavigate();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<TaskPublic[]>([]);
  const [assignmentsByTask, setAssignmentsByTask] = useState<Record<number, AssignmentItem[]>>({});
  const [membersById, setMembersById] = useState<Record<number, MemberItem>>({});
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [planImpactMessage, setPlanImpactMessage] = useState<string | null>(null);
  const [extractingTaskId, setExtractingTaskId] = useState<number | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null);
  const [actionsTask, setActionsTask] = useState<TaskPublic | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  const [myRole, setMyRole] = useState<MemberItem["role"] | null>(null);
  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskPublic | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state (in dialog)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [priority, setPriority] = useState<number>(3);
  const [estimateMinutes, setEstimateMinutes] = useState<number>(60);
  const [deadline, setDeadline] = useState<Dayjs | null>(
    dayjs().add(3, "day").hour(21).minute(0).second(0)
  );
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

  const canSubmit = useMemo(() => {
    if (!canManage) return false;
    if (!title.trim()) return false;
    if (!deadline) return false;
    if (estimateMinutes <= 0) return false;
    if (priority < 1 || priority > 5) return false;
    return true;
  }, [canManage, title, deadline, estimateMinutes, priority]);

  const taskTree = useMemo<TaskNode[]>(() => {
    const childrenByParent = new Map<number | null, TaskPublic[]>();
    items.forEach((task) => {
      const key = task.parent_task_id ?? null;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), task]);
    });

    childrenByParent.forEach((children) => {
      children.sort((a, b) => apiDate(a.deadline).valueOf() - apiDate(b.deadline).valueOf() || a.title.localeCompare(b.title));
    });

    const aggregateEstimate = (task: TaskPublic): number => {
      const children = childrenByParent.get(task.id) ?? [];
      if (children.length === 0) return task.estimate_minutes;
      return children.reduce((total, child) => total + aggregateEstimate(child), 0);
    };

    const aggregateDeadline = (task: TaskPublic): string => {
      const children = childrenByParent.get(task.id) ?? [];
      if (children.length === 0) return task.deadline;
      const childDeadlines = children.map((child) => aggregateDeadline(child));
      return childDeadlines.reduce((latest, current) =>
        apiDate(current).isAfter(apiDate(latest)) ? current : latest
      );
    };

    const result: TaskNode[] = [];
    const visit = (task: TaskPublic, depth: number) => {
      const children = childrenByParent.get(task.id) ?? [];
      result.push({
        ...task,
        depth,
        hasChildren: children.length > 0,
        aggregateEstimateMinutes: aggregateEstimate(task),
        aggregateDeadline: aggregateDeadline(task),
      });
      children.forEach((child) => visit(child, depth + 1));
    };

    (childrenByParent.get(null) ?? []).forEach((task) => visit(task, 0));
    return result;
  }, [items]);

  const editingTaskNode = useMemo(
    () => (editingTask ? taskTree.find((task) => task.id === editingTask.id) : null),
    [editingTask, taskTree]
  );

  const visibleTaskTree = useMemo(() => {
    const visible: TaskNode[] = [];
    const collapsedDepths = new Set<number>();
    for (const task of taskTree) {
      const hidden = Array.from(collapsedDepths).some((depth) => task.depth > depth);
      if (hidden) continue;
      Array.from(collapsedDepths).forEach((depth) => {
        if (task.depth <= depth) collapsedDepths.delete(depth);
      });
      visible.push(task);
      if (task.hasChildren && !expandedTaskIds.has(task.id)) {
        collapsedDepths.add(task.depth);
      }
    }
    return visible;
  }, [expandedTaskIds, taskTree]);

  function resetForm() {
    setEditingTask(null);
    setFormError(null);
    setTitle("");
    setDescription("");
    setParentTaskId("");
    setPriority(3);
    setEstimateMinutes(60);
    setDeadline(dayjs().add(3, "day").hour(21).minute(0).second(0));
    setAssignedUserIds([]);
  }

  function openEditDialog(task: TaskPublic) {
    setActionsAnchor(null);
    setActionsTask(null);
    setFormError(null);
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setParentTaskId(task.parent_task_id ? String(task.parent_task_id) : "");
    setPriority(task.priority);
    setEstimateMinutes(task.estimate_minutes);
    setDeadline(apiDate(task.deadline));
    setAssignedUserIds((assignmentsByTask[task.id] ?? []).map((assignment) => String(assignment.user_id)));
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

  function toggleExpanded(taskId: number) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
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

  const activeMembers = useMemo(
    () => Object.values(membersById).filter((member) => member.status !== "INACTIVE"),
    [membersById]
  );

  async function syncAssignments(taskId: number, desiredUserIds: string[]) {
    const desired = new Set(desiredUserIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    const current = new Set((assignmentsByTask[taskId] ?? []).map((assignment) => assignment.user_id));

    await Promise.all([
      ...Array.from(current)
        .filter((userId) => !desired.has(userId))
        .map((userId) => api.delete(`/tasks/${taskId}/assignments/${userId}`)),
      ...Array.from(desired)
        .filter((userId) => !current.has(userId))
        .map((userId) => api.post(`/tasks/${taskId}/assignments`, { user_id: userId, assigned_minutes: null })),
    ]);
  }

  async function saveTask() {
    if (!canSubmit || !deadline) return;

    setError(null);
    setFormError(null);
    setSuccess(null);
    setLoading(true);

    const isContainer = Boolean(editingTaskNode?.hasChildren);
    const previousAssignedIds = new Set((editingTask ? assignmentsByTask[editingTask.id] ?? [] : []).map((assignment) => String(assignment.user_id)));
    const desiredAssignedIds = new Set(assignedUserIds);
    const assignmentsChanged =
      !isContainer &&
      (previousAssignedIds.size !== desiredAssignedIds.size ||
        Array.from(previousAssignedIds).some((userId) => !desiredAssignedIds.has(userId)));
    const planningFieldsChanged =
      !editingTask ||
      editingTask.priority !== priority ||
      editingTask.estimate_minutes !== estimateMinutes ||
      editingTask.parent_task_id !== (parentTaskId === "" ? null : Number(parentTaskId)) ||
      (!isContainer && apiDate(editingTask.deadline).valueOf() !== deadline.valueOf()) ||
      assignmentsChanged;

    const payload: TaskCreate = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      parent_task_id: parentTaskId === "" ? null : Number(parentTaskId),
      priority,
      estimate_minutes: estimateMinutes,
      deadline: editingTaskNode?.hasChildren ? apiDate(editingTaskNode.aggregateDeadline).toISOString() : deadline.toISOString(),
    };

    try {
      let savedTask: TaskPublic;
      if (editingTask) {
        const res = await api.patch<TaskPublic>(`/tasks/${editingTask.id}`, payload);
        savedTask = res.data;
      } else {
        const res = await api.post<TaskPublic>(`/projects/${projectId}/tasks`, payload);
        savedTask = res.data;
      }

      if (!isContainer) {
        await syncAssignments(savedTask.id, assignedUserIds);
      }

      setOpenDialog(false);
      resetForm();
      await loadTasks();
      if (planningFieldsChanged) {
        setPlanImpactMessage(
          "Modificarea poate afecta planul curent. Verifică tabul Problems sau rulează Replanificare dacă vrei ca programarea din calendar să fie actualizată."
        );
      }
      setSuccess(
        planningFieldsChanged
          ? "Task salvat. Modificarea poate afecta planul curent; verifică tabul Problems sau rulează Replanificare dacă este necesar."
          : "Task salvat."
      );
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, editingTask ? "Nu am putut actualiza task-ul" : "Nu am putut crea task-ul"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteTask(taskId: number) {
    const confirmed = await confirm({
      title: "Ștergere task",
      description: "Sigur vrei să ștergi acest task? Vor fi șterse și asignările, dependențele și planificările asociate.",
      confirmLabel: "Șterge taskul",
    });
    if (!confirmed) return;
    setError(null);
    setLoading(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      await loadTasks();
      setPlanImpactMessage(
        "Taskul a fost șters. Dacă exista deja un plan generat, verifică tabul Plan sau rulează Replanificare."
      );
      setSuccess("Task șters. Dacă exista deja un plan generat, verifică tabul Plan sau rulează Replanificare.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge taskul"));
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

  async function closeTask(taskId: number) {
    const confirmed = await confirm({
      title: "Închidere task",
      description: "Confirmi închiderea acestui task? După închidere, taskul este considerat finalizat.",
      confirmLabel: "Închide taskul",
      tone: "warning",
    });
    if (!confirmed) return;
    setError(null);
    setLoading(true);
    try {
      await api.post(`/tasks/${taskId}/close`);
      await loadTasks();
      setSuccess("Task închis.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut închide taskul"));
    } finally {
      setLoading(false);
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
                setFormError(null);
                setOpenDialog(true);
              }}
              disabled={loading}
            >
              Creează task
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

        {visibleTaskTree.map((t) => {
          const priority = priorityMeta(t.priority);
          const parentTask = t.parent_task_id ? items.find((item) => item.id === t.parent_task_id) : undefined;
          const assignments = assignmentsByTask[t.id] ?? [];
          const myAssignment = me ? assignments.find((assignment) => assignment.user_id === me.id) : undefined;
          const isExpanded = expandedTaskIds.has(t.id);
          const isOverdue = !["READY_TO_CLOSE", "CLOSED"].includes(t.status) && apiDate(t.aggregateDeadline).isBefore(dayjs());

          return (
            <Card
              key={t.id}
              variant="outlined"
              onClick={() => nav(`/activities/${t.id}`)}
              sx={{
                borderRadius: 3,
                overflow: "hidden",
                ml: { xs: 0, md: t.depth * 3 },
                cursor: "pointer",
                borderStyle: t.hasChildren ? "solid" : "solid",
                bgcolor: "background.paper",
                borderColor: t.hasChildren ? alpha(accent.value, 0.5) : undefined,
                boxShadow: t.hasChildren ? `inset 4px 0 0 ${accent.value}` : undefined,
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
                    {t.hasChildren ? (
                      <IconButton
                        size="small"
                        aria-label={isExpanded ? "Restrânge subtaskurile" : "Extinde subtaskurile"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(t.id);
                        }}
                        sx={{ mt: -0.25, border: "1px solid", borderColor: "divider", flexShrink: 0 }}
                      >
                        {isExpanded ? <KeyboardArrowDownRoundedIcon /> : <KeyboardArrowRightRoundedIcon />}
                      </IconButton>
                    ) : (
                      <Box sx={{ width: 34, flexShrink: 0 }} />
                    )}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 900 }} title={t.title}>
                        {t.title}
                      </Typography>
                      {t.hasChildren ? (
                        <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.35 }}>
                          Task părinte · {items.filter((item) => item.parent_task_id === t.id).length} subtaskuri
                        </Typography>
                      ) : null}
                      {t.description ? (
                        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, maxWidth: 860 }}>
                          {t.description}
                        </Typography>
                      ) : null}
                    </Box>
                    <Chip
                      size="small"
                      label={t.hasChildren ? "TASK PĂRINTE" : statusChipLabel(t.status)}
                      color={t.hasChildren ? "info" : statusChipColor(t.status)}
                      variant={t.hasChildren ? "filled" : "outlined"}
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
                        label={`${t.hasChildren ? "Estimare agregată" : "Estimare"}: ${formatMinutes(t.aggregateEstimateMinutes)}`}
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
                        icon={isOverdue ? <WarningAmberRoundedIcon /> : <EventRoundedIcon />}
                        label={`${t.hasChildren ? "Deadline agregat" : "Deadline"}: ${apiDate(t.aggregateDeadline).format("DD MMM YYYY, HH:mm")}`}
                        color={isOverdue ? "error" : "default"}
                        variant="outlined"
                        sx={{
                          justifyContent: "flex-start",
                          bgcolor: (theme) => isOverdue ? (theme.palette.mode === "dark" ? alpha("#EF4444", 0.16) : "#FEF2F2") : (theme.palette.mode === "dark" ? alpha("#CBD5E1", 0.12) : alpha("#475569", 0.08)),
                          color: isOverdue ? "error.main" : "text.secondary",
                          border: "1px solid",
                          borderColor: isOverdue ? "error.main" : "divider",
                          fontWeight: 800,
                          "& .MuiChip-icon": { color: "inherit" },
                          maxWidth: "100%",
                        }}
                      />
                      {t.hasChildren ? (
                        <Chip
                          icon={<AccountTreeRoundedIcon />}
                          label="Se planifică prin subtaskuri"
                          sx={{
                            justifyContent: "flex-start",
                            bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#22C55E", 0.14) : "#DCFCE7"),
                            color: (theme) => (theme.palette.mode === "dark" ? "#BBF7D0" : "#166534"),
                            border: "1px solid",
                            borderColor: (theme) => (theme.palette.mode === "dark" ? "rgba(187,247,208,0.22)" : "rgba(22,101,52,0.18)"),
                            fontWeight: 800,
                            "& .MuiChip-icon": { color: "inherit" },
                            maxWidth: "100%",
                          }}
                        />
                      ) : assignments.length > 0 ? (
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
                        {!t.hasChildren && myRole === "OWNER" && t.status === "READY_TO_CLOSE" ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={(event) => {
                              event.stopPropagation();
                              void closeTask(t.id);
                            }}
                            disabled={loading}
                          >
                            Închide task
                          </Button>
                        ) : null}
                        {!t.hasChildren && myAssignment ? (
                          <FormControl size="small" sx={{ minWidth: 150, flexShrink: 0 }}>
                            <InputLabel id={`assignment-status-${t.id}`}>Statusul meu</InputLabel>
                            <Select
                              labelId={`assignment-status-${t.id}`}
                              label="Statusul meu"
                              value={myAssignment.member_status}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => void updateMyAssignmentStatus(t.id, event.target.value as MemberStatus)}
                              disabled={loading || t.status === "CLOSED"}
                            >
                              <MenuItem value="TODO">TODO</MenuItem>
                              <MenuItem value="IN_PROGRESS">IN PROGRESS</MenuItem>
                              <MenuItem value="DONE">DONE</MenuItem>
                            </Select>
                          </FormControl>
                        ) : null}

                        {canManage ? (
                          <IconButton
                            onClick={(event) => {
                              event.stopPropagation();
                              openActions(event, t);
                            }}
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
          disabled={!actionsTask || extractingTaskId === actionsTask.id || Boolean(taskTree.find((task) => task.id === actionsTask?.id)?.hasChildren)}
          onClick={() => {
            if (!actionsTask) return;
            if (taskTree.find((task) => task.id === actionsTask.id)?.hasChildren) return;
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
          <ListItemText>Editează</ListItemText>
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
          <ListItemText>Șterge</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(planImpactMessage)} onClose={() => setPlanImpactMessage(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Planul poate necesita actualizare</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "text.secondary" }}>
            {planImpactMessage}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setPlanImpactMessage(null)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingTask ? "Editeaza task" : "Creează task"}</DialogTitle>
        {formError ? (
          <Box sx={{ px: 3, pb: 1 }}>
            <Alert severity="error" onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          </Box>
        ) : null}

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
                label={editingTaskNode?.hasChildren ? "Estimare agregată (minute)" : "Estimare (minute)"}
                type="number"
                value={editingTaskNode?.hasChildren ? editingTaskNode.aggregateEstimateMinutes : estimateMinutes}
                onChange={(e) => setEstimateMinutes(Number(e.target.value))}
                slotProps={{ htmlInput: { min: 1 } }}
                disabled={Boolean(editingTaskNode?.hasChildren)}
                helperText={editingTaskNode?.hasChildren ? "Taskurile părinte se estimează automat din subtaskuri." : undefined}
                fullWidth
              />
            </Stack>

            <Typography sx={{ color: "text.secondary", fontSize: 13, mt: -1 }}>
              P5 este cea mai urgentă, P1 cea mai puțin urgentă. Prioritatea nu înlocuiește deadline-ul, doar departajează taskuri similare.
            </Typography>

            <FormControl fullWidth disabled={Boolean(editingTaskNode?.hasChildren)}>
              <InputLabel id="assignees-label">Responsabili</InputLabel>
              <Select
                labelId="assignees-label"
                label="Responsabili"
                multiple
                value={assignedUserIds}
                onChange={(event) => {
                  const value = event.target.value;
                  setAssignedUserIds(typeof value === "string" ? value.split(",") : value);
                }}
                renderValue={(selected) =>
                  selected
                    .map((id) => {
                      const member = membersById[Number(id)];
                      return member?.name || member?.email || `User #${id}`;
                    })
                    .join(", ")
                }
              >
                {activeMembers.map((member) => {
                  const value = String(member.user_id);
                  const label = member.name || member.email || `User #${member.user_id}`;
                  return (
                    <MenuItem key={member.user_id} value={value}>
                      <Checkbox checked={assignedUserIds.includes(value)} />
                      <ListItemText primary={label} secondary={member.role} />
                    </MenuItem>
                  );
                })}
              </Select>
              <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.75 }}>
                Owner/Admin poate asigna manual taskul. Planificarea automată păstrează asignările manuale existente.
              </Typography>
            </FormControl>

            <DateTimePicker
              label={editingTaskNode?.hasChildren ? "Deadline agregat" : "Deadline"}
              value={editingTaskNode?.hasChildren ? apiDate(editingTaskNode.aggregateDeadline) : deadline}
              onChange={(v) => setDeadline(v)}
              ampm={false}
              minutesStep={1}
              timeSteps={{ minutes: 1 }}
              format="DD.MM.YYYY HH:mm"
              slotProps={{
                textField: {
                  fullWidth: true,
                  helperText: editingTaskNode?.hasChildren
                    ? "Taskurile părinte își iau deadline-ul din cel mai îndepărtat subtask."
                    : "Poți alege ora din selector sau o poți introduce manual, de exemplu 30.06.2026 18:37.",
                },
              }}
              disabled={Boolean(editingTaskNode?.hasChildren)}
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
            Anulează
          </Button>
          <Button variant="contained" onClick={saveTask} disabled={!canSubmit || loading}>
            Salvează
          </Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Box>
  );
}
