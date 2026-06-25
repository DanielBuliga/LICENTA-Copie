import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { useConfirmDialog } from "../../components/useConfirmDialog";
import { useAccentColor } from "../../hooks/useAccentColor";
import { apiDate } from "../../utils/dateTime";

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

type SkillItem = {
  id: number;
  name: string;
};

type MemberSkillItem = {
  user_id: number;
  skill_id: number;
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

function memberAddErrorMessage(raw: string) {
  const value = raw.toLowerCase();
  if (value.includes("not found") || value.includes("does not exist") || value.includes("user not")) return "Nu există un utilizator cu această adresă de email.";
  if (value.includes("already") || value.includes("exists")) return "Utilizatorul este deja membru în acest proiect.";
  if (value.includes("valid") || value.includes("email")) return "Introdu o adresă de email validă.";
  if (value.includes("permission") || value.includes("forbidden") || value.includes("403")) return "Nu ai permisiunea de a adăuga membri în acest proiect.";
  return raw || "Nu am putut adăuga membrul.";
}

function estimatedChipWidth(label: string) {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = "700 13px Segoe UI, Arial, sans-serif";
      return Math.min(180, Math.max(50, Math.ceil(context.measureText(label).width) + 28));
    }
  }
  return Math.min(180, Math.max(50, label.length * 6 + 28));
}

function MemberSkillPreview({
  skills,
  member,
  accent,
  onOpen,
}: {
  skills: SkillItem[];
  member: MemberItem;
  accent: { soft: string; text: string };
  onOpen: (member: MemberItem) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const updateWidth = () => setRowWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleCount = useMemo(() => {
    if (!skills.length) return 0;
    if (!rowWidth) return Math.min(skills.length, 8);

    const gap = 6;
    const widths = skills.map((skill) => estimatedChipWidth(skill.name));

    function fits(count: number, includeMoreChip: boolean) {
      const items = widths.slice(0, count);
      if (includeMoreChip) items.push(46);
      let rows = 1;
      let used = 0;
      for (const width of items) {
        const nextUsed = used ? used + gap + width : width;
        if (nextUsed <= rowWidth) {
          used = nextUsed;
          continue;
        }
        rows += 1;
        used = width;
        if (rows > 2) return false;
      }
      return true;
    }

    if (fits(skills.length, false)) return skills.length;

    for (let count = skills.length - 1; count >= 1; count -= 1) {
      if (fits(count, true)) return count;
    }
    return 1;
  }, [rowWidth, skills]);

  if (!skills.length) {
    return <Typography sx={{ color: "text.disabled", fontSize: 13 }}>Fără competențe setate</Typography>;
  }

  const visibleSkills = skills.slice(0, visibleCount);
  const extraSkillCount = Math.max(0, skills.length - visibleSkills.length);

  return (
    <Box ref={rowRef} sx={{ display: "flex", gap: 0.75, rowGap: 0.75, alignItems: "center", overflow: "hidden", flexWrap: "wrap", maxHeight: 56, minWidth: 0 }}>
      {visibleSkills.map((skill) => (
        <Chip key={skill.id} size="small" label={skill.name} sx={{ fontWeight: 800, flexShrink: 0, maxWidth: 180 }} />
      ))}
      {extraSkillCount > 0 ? (
        <Tooltip title="Vezi toate competențele">
          <Chip
            size="small"
            label={`+${extraSkillCount}`}
            onClick={() => onOpen(member)}
            sx={{ fontWeight: 900, cursor: "pointer", bgcolor: accent.soft, color: accent.text, flexShrink: 0 }}
          />
        </Tooltip>
      ) : null}
    </Box>
  );
}

export function MembersTab({ projectId }: { projectId: number }) {
  const accent = useAccentColor();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberStats, setMemberStats] = useState<Record<number, { assigned: number; done: number }>>({});
  const [memberSkills, setMemberSkills] = useState<Record<number, SkillItem[]>>({});
  const [skillsDialogMember, setSkillsDialogMember] = useState<MemberItem | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [projectCreatorId, setProjectCreatorId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberItem["role"]>("MEMBER");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [memberDialogError, setMemberDialogError] = useState<string | null>(null);
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
      const [tasksRes, skillsRes, memberSkillsRes] = await Promise.all([
        api.get<TaskItem[]>(`/projects/${projectId}/tasks`),
        api.get<SkillItem[]>("/skills"),
        api.get<MemberSkillItem[]>(`/projects/${projectId}/member-skills`),
      ]);
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
      const skillById = new Map(skillsRes.data.map((skill) => [skill.id, skill]));
      const nextSkills: Record<number, SkillItem[]> = {};
      for (const member of membersRes.data) {
        nextSkills[member.user_id] = [];
      }
      for (const row of memberSkillsRes.data) {
        const skill = skillById.get(row.skill_id);
        if (!skill) continue;
        const list = nextSkills[row.user_id] ?? [];
        list.push(skill);
        nextSkills[row.user_id] = list;
      }
      for (const userId of Object.keys(nextSkills)) {
        nextSkills[Number(userId)].sort((a, b) => a.name.localeCompare(b.name));
      }
      setMembers(membersRes.data);
      setMemberStats(nextStats);
      setMemberSkills(nextSkills);
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
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setMemberDialogError("Introdu o adresă de email validă.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setError(null);
    setMemberDialogError(null);
    try {
      await api.post(`/projects/${projectId}/members`, { email: cleanEmail, role });
      setEmail("");
      setRole("MEMBER");
      setDialogOpen(false);
      await load();
    } catch (err: unknown) {
      setMemberDialogError(memberAddErrorMessage(getApiErrorMessage(err, "Nu am putut adăuga membrul.")));
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(userId: number) {
    const confirmed = await confirm({
      title: "Eliminare membru",
      description: "Sigur vrei să elimini acest membru din proiect? Dacă are istoric, sistemul îl va păstra ca inactiv.",
      confirmLabel: "Elimină membrul",
    });
    if (!confirmed) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.delete<MemberRemoveResponse>(`/projects/${projectId}/members/${userId}`);
      setMessage(res.data.message);
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge membrul"));
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
    if (nextStatus === "INACTIVE") {
      const confirmed = await confirm({
        title: "Inactivare membru",
        description: "Marchezi acest membru ca inactiv? Nu va mai intra în planificare, iar taskurile active asignate lui vor apărea în Problems.",
        confirmLabel: "Marchează inactiv",
        tone: "warning",
      });
      if (!confirmed) return;
    }
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
          <Button
            variant="contained"
            startIcon={<PersonAddRoundedIcon />}
            onClick={() => {
              setMemberDialogError(null);
              setDialogOpen(true);
            }}
          >
            Adaugă membru
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
          const skills = memberSkills[member.user_id] ?? [];

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
                      label={`Inactiv din ${apiDate(member.inactive_at).format("DD.MM.YYYY")}`}
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

                <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
                    <PsychologyRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                    <Typography sx={{ color: "text.secondary", fontSize: 13, fontWeight: 900 }}>
                      Competențe
                    </Typography>
                  </Stack>
                  <MemberSkillPreview skills={skills} member={member} accent={accent} onOpen={setSkillsDialogMember} />
                </Box>

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
        <DialogTitle>Adaugă membru</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {memberDialogError ? <Alert severity="error">{memberDialogError}</Alert> : null}
            <TextField
              label="Email"
              placeholder="email@exemplu.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setMemberDialogError(null);
              }}
              error={Boolean(memberDialogError)}
              fullWidth
              autoFocus
            />
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
          <Button onClick={() => setDialogOpen(false)}>Anulează</Button>
          <Button variant="contained" onClick={addMember} disabled={!email.trim() || loading}>
            Adaugă
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(skillsDialogMember)} onClose={() => setSkillsDialogMember(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          Competențe membru
        </DialogTitle>
        <DialogContent>
          {skillsDialogMember ? (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Box>
                <Typography sx={{ fontWeight: 950 }}>
                  {skillsDialogMember.name || `User #${skillsDialogMember.user_id}`}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
                  {skillsDialogMember.email ?? "email indisponibil"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                {(memberSkills[skillsDialogMember.user_id] ?? []).map((skill) => (
                  <Chip key={skill.id} label={skill.name} sx={{ fontWeight: 850 }} />
                ))}
                {(memberSkills[skillsDialogMember.user_id] ?? []).length === 0 ? (
                  <Typography sx={{ color: "text.secondary" }}>Membrul nu are competențe setate.</Typography>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkillsDialogMember(null)}>Închide</Button>
        </DialogActions>
      </Dialog>
      {confirmDialog}
    </Stack>
  );
}
