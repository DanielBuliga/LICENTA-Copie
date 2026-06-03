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
  joined_at: string;
};

type CurrentUser = { id: number };

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberItem["role"]>("MEMBER");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
      const [membersRes, meRes] = await Promise.all([
        api.get<MemberItem[]>(`/projects/${projectId}/members`),
        api.get<CurrentUser>("/users/me"),
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
    if (!window.confirm("Sigur vrei să elimini acest membru din proiect? Asignările și planificările lui din proiect vor fi eliminate.")) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge membrul"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      {loading ? <LinearProgress /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography sx={{ color: "text.secondary" }}>{members.length} membri</Typography>
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
          const stats = memberStats[member.user_id] ?? { assigned: 0, done: 0 };

          return (
            <Card key={member.user_id}>
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
                  <Chip
                    label={roleInfo.label}
                    sx={{
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? alpha(roleInfo.color, 0.22) : roleInfo.soft),
                      color: (theme) => (theme.palette.mode === "dark" ? "#F8FAFC" : roleInfo.color),
                      border: `1px solid ${alpha(roleInfo.color, 0.24)}`,
                      fontWeight: 950,
                    }}
                  />
                </Stack>

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
                      Sterge
                    </Button>
                  ) : null}
                </Stack>
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
