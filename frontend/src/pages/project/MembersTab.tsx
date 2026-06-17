import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { useAccentColor } from "../../hooks/useAccentColor";

type MemberItem = {
  user_id: number;
  name?: string | null;
  email?: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "INACTIVE";
  joined_at: string;
  inactive_at?: string | null;
  inactive_reason?: string | null;
};

type CurrentUser = { id: number };
type ProjectInfo = { id: number; created_by: number };

type TaskItem = {
  id: number;
};

type AssignmentItem = {
  id: number;
  task_id: number;
  user_id: number;
  assigned_minutes: number | null;
  member_status: "TODO" | "IN_PROGRESS" | "DONE";
};

type MemberRemoveResponse = {
  action: "deleted" | "deactivated";
  status: "INACTIVE" | null;
  message: string;
};

function roleMeta(role: MemberItem["role"]) {
  if (role === "OWNER") return { label: "OWNER", color: "#4F46E5", soft: "#E0E7FF" };
  if (role === "ADMIN") return { label: "ADMIN", color: "#0284C7", soft: "#E0F2FE" };
  return { label: "MEMBER", color: "#64748B", soft: "#EEF2F7" };
}

export function MembersTab({ projectId }: { projectId: number }) {
  const accent = useAccentColor();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberStats, setMemberStats] = useState<Record<number, { assigned: number; done: number }>>({});
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [projectCreatorId, setProjectCreatorId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberItem["role"]>("MEMBER");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMember = useMemo(
    () => members.find((member) => member.user_id === currentUserId),
    [currentUserId, members]
  );
  const isOwner = currentMember?.role === "OWNER";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, meRes, projectRes] = await Promise.all([
        api.get<MemberItem[]>(`/projects/${projectId}/members`),
        api.get<CurrentUser>("/users/me"),
        api.get<ProjectInfo>(`/projects/${projectId}`),
      ]);
      const tasksRes = await api.get<TaskItem[]>(`/projects/${projectId}/tasks`);
      const assignmentPairs = await Promise.all(
        tasksRes.data.map(async (task) => {
          const res = await api.get<AssignmentItem[]>(`/tasks/${task.id}/assignments`);
          return [task.id, res.data] as const;
        })
      );
      const nextStats: Record<number, { assigned: number; done: number }> = {};
      for (const member of membersRes.data) {
        nextStats[member.user_id] = { assigned: 0, done: 0 };
      }
      for (const [, assignments] of assignmentPairs) {
        for (const assignment of assignments) {
          const stats = nextStats[assignment.user_id] ?? { assigned: 0, done: 0 };
          stats.assigned += 1;
          if (assignment.member_status === "DONE") stats.done += 1;
          nextStats[assignment.user_id] = stats;
        }
      }
      setMembers(membersRes.data);
      setMemberStats(nextStats);
      setCurrentUserId(meRes.data.id);
      setProjectCreatorId(projectRes.data.created_by);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca membrii"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMember() {
    if (!email.trim()) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/members`, { email: email.trim(), role });
      setEmail("");
      setRole("MEMBER");
      setDialogOpen(false);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut adauga membrul"));
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(userId: number) {
    if (!window.confirm("Sigur vrei să elimini definitiv acest membru din proiect? Operația este destinată membrilor adăugați din greșeală. Dacă are istoric, sistemul îl va păstra ca inactiv.")) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.delete<MemberRemoveResponse>(`/projects/${projectId}/members/${userId}`);
      setMessage(res.data.message);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge membrul"));
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(userId: number, nextRole: MemberItem["role"]) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await api.patch(`/projects/${projectId}/members/${userId}`, { role: nextRole });
      setMessage("Rolul membrului a fost actualizat.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza rolul membrului"));
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(userId: number, nextStatus: MemberItem["status"]) {
    if (nextStatus === "INACTIVE" && !window.confirm("Marchezi acest membru ca inactiv? Nu va mai intra în planificare, iar taskurile active asignate lui vor apărea în Problems.")) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await api.patch(`/projects/${projectId}/members/${userId}/status`, {
        status: nextStatus,
        reason: nextStatus === "INACTIVE" ? "Marcat inactiv manual" : undefined,
      });
      setMessage(nextStatus === "ACTIVE" ? "Membrul a fost reactivat în proiect." : "Membrul a fost marcat ca inactiv.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza statusul membrului"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      {loading ? <LinearProgress /> : null}
      {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography sx={{ color: "text.secondary" }}>
          {members.filter((member) => member.status === "ACTIVE").length} activi / {members.length} total
        </Typography>
        {isOwner ? (
          <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={() => setDialogOpen(true)}>
            Adauga membru
          </Button>
        ) : null}
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 2 }}>
        {members.map((member) => {
          const displayName = member.name || `User #${member.user_id}`;
          const initials = displayName.slice(0, 1).toUpperCase();
          const roleInfo = roleMeta(member.role);
          const canRemove = isOwner && member.user_id !== currentUserId;
          const isInactive = member.status === "INACTIVE";
          const canEditRole = isOwner && !isInactive && member.user_id !== projectCreatorId;
          const canEditStatus = isOwner && member.user_id !== projectCreatorId;
          const stats = memberStats[member.user_id] ?? { assigned: 0, done: 0 };

          return (
            <Card key={member.user_id} sx={{ opacity: isInactive ? 0.72 : 1 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", mb: 2 }}>
                  <Avatar sx={{ bgcolor: accent.soft, color: accent.text, fontWeight: 900 }}>{initials}</Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 900 }}>
                      {displayName}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary" }}>
                      <MailOutlineRoundedIcon sx={{ fontSize: 16 }} />
                      <Typography noWrap sx={{ fontSize: 14 }}>
                        {member.email ?? "email indisponibil"}
                      </Typography>
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexShrink: 0 }}>
                    {canEditStatus ? (
                      <FormControl size="small" sx={{ minWidth: 104 }} onClick={(event) => event.stopPropagation()}>
                        <Select
                          value={member.status}
                          onChange={(event) => void changeStatus(member.user_id, event.target.value as MemberItem["status"])}
                          sx={{
                            height: 32,
                            borderRadius: 99,
                            fontWeight: 950,
                            color: isInactive ? "text.secondary" : "success.dark",
                            bgcolor: (theme) => (isInactive ? "transparent" : theme.palette.mode === "dark" ? alpha("#16A34A", 0.2) : "#DCFCE7"),
                            "& .MuiSelect-select": { py: 0.5, pl: 1.5 },
                          }}
                        >
                          <MenuItem value="ACTIVE">Activ</MenuItem>
                          <MenuItem value="INACTIVE">Inactiv</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <Chip
                        label={isInactive ? "Inactiv" : "Activ"}
                        color={isInactive ? "default" : "success"}
                        variant={isInactive ? "outlined" : "filled"}
                        sx={{ fontWeight: 900 }}
                      />
                    )}
                    {canEditRole ? (
                      <FormControl size="small" sx={{ minWidth: 112 }} onClick={(event) => event.stopPropagation()}>
                        <Select
                          value={member.role}
                          onChange={(event) => void changeRole(member.user_id, event.target.value as MemberItem["role"])}
                          sx={{
                            height: 32,
                            borderRadius: 99,
                            fontWeight: 950,
                            color: roleInfo.color,
                            bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha(roleInfo.color, 0.22) : roleInfo.soft),
                            "& .MuiSelect-select": { py: 0.5, pl: 1.5 },
                          }}
                        >
                          <MenuItem value="MEMBER">MEMBER</MenuItem>
                          <MenuItem value="ADMIN">ADMIN</MenuItem>
                          <MenuItem value="OWNER">OWNER</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <Chip
                        label={roleInfo.label}
                        sx={{
                          bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha(roleInfo.color, 0.22) : roleInfo.soft),
                          color: (theme) => (theme.palette.mode === "dark" ? "#F8FAFC" : roleInfo.color),
                          border: `1px solid ${alpha(roleInfo.color, 0.24)}`,
                          fontWeight: 950,
                        }}
                      />
                    )}
                  </Stack>
                </Stack>

                {member.inactive_at ? (
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 1.5 }}>
                    <Chip
                      label={`Inactiv din ${new Date(member.inactive_at).toLocaleDateString("ro-RO")}`}
                      variant="outlined"
                      sx={{ fontWeight: 800 }}
                    />
                  </Stack>
                ) : null}

                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  <Chip
                    icon={<AssignmentTurnedInOutlinedIcon />}
                    label={`Task-uri: ${stats.assigned}`}
                    sx={{
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha(accent.value, 0.18) : accent.soft),
                      color: (theme) => (theme.palette.mode === "dark" ? "#F8FAFC" : accent.text),
                      border: `1px solid ${alpha(accent.value, 0.22)}`,
                      fontWeight: 800,
                      "& .MuiChip-icon": { color: "inherit" },
                    }}
                  />
                  <Chip
                    icon={<CheckCircleOutlineRoundedIcon />}
                    label={`Finalizate: ${stats.done}`}
                    sx={{
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha("#16A34A", 0.18) : "#DCFCE7"),
                      color: (theme) => (theme.palette.mode === "dark" ? "#DCFCE7" : "#166534"),
                      border: `1px solid ${alpha("#16A34A", 0.24)}`,
                      fontWeight: 800,
                      "& .MuiChip-icon": { color: "inherit" },
                    }}
                  />
                  <Box sx={{ flex: 1 }} />
                  {canRemove ? (
                    <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => void removeMember(member.user_id)}>
                      Șterge
                    </Button>
                  ) : null}
                </Stack>
                {member.inactive_reason ? (
                  <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 1.5 }}>
                    Motiv: {member.inactive_reason}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Adauga membru</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Email" placeholder="email@exemplu.com" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth autoFocus />
            <FormControl fullWidth>
              <InputLabel id="role-label">Rol</InputLabel>
              <Select labelId="role-label" label="Rol" value={role} onChange={(event) => setRole(event.target.value as MemberItem["role"])}>
                <MenuItem value="MEMBER">MEMBER</MenuItem>
                <MenuItem value="ADMIN">ADMIN</MenuItem>
                <MenuItem value="OWNER">OWNER</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Anuleaza</Button>
          <Button variant="contained" onClick={addMember} disabled={!email.trim() || loading}>
            Adauga
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
