import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useConfirmDialog } from "../components/useConfirmDialog";
import { useAccentColor } from "../hooks/useAccentColor";
import type { ProjectListItem } from "../api/types";

type Skill = {
  id: number;
  name: string;
};

type SkillAlias = {
  id: number;
  skill_id: number;
  alias: string;
};

type UserSkill = {
  skill_id: number;
};

type MemberSkill = UserSkill & {
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
};

export function SkillsPage() {
  const accent = useAccentColor();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [aliasesBySkill, setAliasesBySkill] = useState<Record<number, SkillAlias[]>>({});
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [memberSkills, setMemberSkills] = useState<MemberSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newAliasBySkill, setNewAliasBySkill] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, mySkillsRes, projectsRes] = await Promise.all([
        api.get<Skill[]>("/skills"),
        api.get<UserSkill[]>("/users/me/skills"),
        api.get<ProjectListItem[]>("/projects"),
      ]);
      setSkills(skillsRes.data);
      const aliasPairs = await Promise.all(
        skillsRes.data.map(async (skill) => {
          const aliasesRes = await api.get<SkillAlias[]>(`/skills/${skill.id}/aliases`);
          return [skill.id, aliasesRes.data] as const;
        })
      );
      setAliasesBySkill(Object.fromEntries(aliasPairs));
      setMySkills(mySkillsRes.data);
      const managedProjects = projectsRes.data.filter((project) => project.role === "OWNER" || project.role === "ADMIN");
      setProjects(managedProjects);
      setSelectedProjectId((current) => current || (managedProjects[0] ? String(managedProjects[0].id) : ""));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca competențele"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMemberSkills = useCallback(async (projectId: string) => {
    if (!projectId) {
      setMemberSkills([]);
      return;
    }
    try {
      const res = await api.get<MemberSkill[]>(`/projects/${projectId}/member-skills`);
      setMemberSkills(res.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca skillurile membrilor"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMemberSkills(selectedProjectId);
  }, [loadMemberSkills, selectedProjectId]);

  const mySkillIds = useMemo(() => new Set(mySkills.map((skill) => skill.skill_id)), [mySkills]);
  const availableToAdd = skills.filter((skill) => !mySkillIds.has(skill.id));

  function skillName(skillId: number) {
    return skills.find((skill) => skill.id === skillId)?.name ?? `Skill ${skillId}`;
  }

  async function addMySkill() {
    if (!selectedSkillId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/users/me/skills", { skill_id: Number(selectedSkillId) });
      setSelectedSkillId("");
      setSuccess("Competența a fost adăugată profilului tău.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut adăuga competența"));
    } finally {
      setSaving(false);
    }
  }

  async function createSkill() {
    const name = newSkillName.trim();
    if (!name) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/skills", { name });
      setNewSkillName("");
      setSuccess("Competența nouă a fost creată.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut crea competența"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMySkill(skillId: number) {
    const confirmed = await confirm({
      title: "Ștergere competență",
      description: "Sigur vrei să ștergi această competență din profilul tău?",
      confirmLabel: "Șterge competența",
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/users/me/skills/${skillId}`);
      setSuccess("Competența a fost ștearsă din profilul tău.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge competența"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCatalogSkill(skillId: number) {
    const confirmed = await confirm({
      title: "Ștergere din catalog",
      description: "Sigur vrei să ștergi această competență din catalog?",
      confirmLabel: "Șterge competența",
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/skills/${skillId}`);
      setSuccess("Skillul a fost șters din catalog.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge skillul. Dacă este folosit de utilizatori sau taskuri, trebuie păstrat."));
    } finally {
      setSaving(false);
    }
  }

  async function addAlias(skillId: number) {
    const alias = (newAliasBySkill[skillId] ?? "").trim();
    if (!alias) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/skills/${skillId}/aliases`, { alias });
      setNewAliasBySkill((current) => ({ ...current, [skillId]: "" }));
      setSuccess("Aliasul a fost adăugat.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut adăuga aliasul"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlias(skillId: number, aliasId: number) {
    const confirmed = await confirm({
      title: "Ștergere alias",
      description: "Sigur vrei să ștergi acest alias?",
      confirmLabel: "Șterge aliasul",
    });
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/skills/${skillId}/aliases/${aliasId}`);
      setSuccess("Aliasul a fost șters.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge aliasul"));
    } finally {
      setSaving(false);
    }
  }

  const memberSkillsByUser = useMemo(() => {
    const grouped = new Map<number, MemberSkill[]>();
    memberSkills.forEach((row) => {
      grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row]);
    });
    return [...grouped.entries()];
  }, [memberSkills]);

  return (
    <AppLayout title="Competențe" eyebrow="Profil și eligibilitate">
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <StarBorderRoundedIcon sx={{ color: accent.value }} />
                  <Typography variant="h6">Skillurile mele</Typography>
                </Stack>
                <Tooltip title="Skillurile declarate de utilizator sunt folosite direct la eligibilitatea pentru taskuri.">
                  <IconButton size="small">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="skill-select-label">Adaugă un skill</InputLabel>
                  <Select
                    labelId="skill-select-label"
                    label="Adaugă un skill"
                    value={selectedSkillId}
                    onChange={(event) => setSelectedSkillId(event.target.value)}
                  >
                    {availableToAdd.map((skill) => (
                      <MenuItem key={skill.id} value={String(skill.id)}>
                        {skill.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button variant="contained" onClick={addMySkill} disabled={!selectedSkillId || saving}>
                  Adaugă
                </Button>
              </Stack>

              <Stack direction="row" spacing={1} useFlexGap sx={{ minHeight: 96, flexWrap: "wrap" }}>
                {mySkills.map((skill) => (
                  <Chip
                    key={skill.skill_id}
                    label={skillName(skill.skill_id)}
                    onDelete={() => void deleteMySkill(skill.skill_id)}
                    deleteIcon={<DeleteOutlineRoundedIcon />}
                    sx={{ fontWeight: 900, bgcolor: accent.soft, color: accent.text }}
                  />
                ))}
                {mySkills.length === 0 && !loading ? (
                  <Typography sx={{ color: "text.secondary", mx: "auto", mt: 4 }}>Niciun skill adăugat</Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card
            sx={{
              height: { xs: "70vh", lg: "calc(100vh - 220px)" },
              minHeight: 420,
              maxHeight: 620,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <CardContent
              sx={{
                p: 3,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <BuildRoundedIcon sx={{ color: accent.value }} />
                  <Typography variant="h6">Skillbook</Typography>
                </Stack>
                <Tooltip title="Catalogul controlează skillurile care pot fi extrase automat din taskuri.">
                  <IconButton size="small">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                  label="Nume skill nou"
                  value={newSkillName}
                  onChange={(event) => setNewSkillName(event.target.value)}
                  fullWidth
                />
                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={createSkill}
                  disabled={!newSkillName.trim() || saving}
                  sx={{ minWidth: 82 }}
                >
                  Adaugă
                </Button>
              </Stack>

              <Stack
                spacing={1.25}
                sx={{
                  overflowY: "auto",
                  pr: 0.75,
                  minHeight: 0,
                  flex: "1 1 0",
                  maxHeight: "none",
                }}
              >
                {skills.map((skill) => (
                  <Box
                    key={skill.id}
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "minmax(140px, 1fr) minmax(220px, 2fr) auto" },
                      alignItems: "center",
                      gap: 1,
                      px: 2,
                      py: 1.35,
                      borderRadius: 2,
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "#F8FAFC"),
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Typography sx={{ fontWeight: 800 }}>{skill.name}</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                      {(aliasesBySkill[skill.id] ?? []).map((alias) => (
                        <Chip
                          key={alias.id}
                          size="small"
                          label={alias.alias}
                          onDelete={() => void deleteAlias(skill.id, alias.id)}
                          sx={{ fontWeight: 800 }}
                        />
                      ))}
                      <TextField
                        size="small"
                        label="Alias"
                        value={newAliasBySkill[skill.id] ?? ""}
                        onChange={(event) => setNewAliasBySkill((current) => ({ ...current, [skill.id]: event.target.value }))}
                        sx={{ minWidth: 140, flex: "1 1 140px" }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void addAlias(skill.id)}
                        disabled={!(newAliasBySkill[skill.id] ?? "").trim() || saving}
                      >
                        Alias
                      </Button>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                      <IconButton color="error" onClick={() => void deleteCatalogSkill(skill.id)} disabled={saving}>
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                ))}
                {skills.length === 0 && !loading ? (
                  <Typography sx={{ color: "text.secondary" }}>Nu există competențe definite.</Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", mb: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <GroupsRoundedIcon sx={{ color: accent.value }} />
                <Box>
                  <Typography variant="h6">Skillurile membrilor</Typography>
                  <Typography sx={{ color: "text.secondary" }}>Skillurile sunt declarate direct de utilizatori. Owner/Admin le poate consulta pentru planificare.</Typography>
                </Box>
              </Stack>
              <FormControl sx={{ minWidth: 240 }}>
                <InputLabel id="managed-project-label">Proiect</InputLabel>
                <Select labelId="managed-project-label" label="Proiect" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  {projects.map((project) => <MenuItem key={project.id} value={String(project.id)}>{project.title}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <Stack spacing={1.25}>
              {memberSkillsByUser.map(([userId, rows]) => {
                const first = rows[0];
                return (
                  <Box key={userId} sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontWeight: 900 }}>{first.user_name || first.user_email || `User #${userId}`}</Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                      {rows.map((row) => (
                        <Chip key={`${row.user_id}-${row.skill_id}`} label={skillName(row.skill_id)} sx={{ fontWeight: 800 }} />
                      ))}
                    </Stack>
                  </Box>
                );
              })}
              {projects.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Nu administrezi niciun proiect momentan.</Typography> : null}
              {projects.length > 0 && memberSkills.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Membrii proiectului nu au skilluri personale adăugate.</Typography> : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
      {confirmDialog}
    </AppLayout>
  );
}
