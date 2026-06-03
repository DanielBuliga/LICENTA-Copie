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
  Slider,
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
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useAccentColor } from "../hooks/useAccentColor";
import type { ProjectListItem } from "../api/types";

type Skill = {
  id: number;
  name: string;
};

type UserSkill = {
  skill_id: number;
  level: number;
  validation_status: "PENDING" | "VALIDATED" | "ADJUSTED";
  validated_by: number | null;
};

type MemberSkill = UserSkill & {
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
};

function levelLabel(level: number) {
  if (level >= 5) return "Expert";
  if (level === 4) return "Avansat";
  if (level === 3) return "Mediu";
  if (level === 2) return "Incepator";
  return "Basic";
}

export function SkillsPage() {
  const accent = useAccentColor();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [memberSkills, setMemberSkills] = useState<MemberSkill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [selectedLevel, setSelectedLevel] = useState(3);
  const [newSkillName, setNewSkillName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRes, mySkillsRes] = await Promise.all([
        api.get<Skill[]>("/skills"),
        api.get<UserSkill[]>("/users/me/skills"),
      ]);
      const projectsRes = await api.get<ProjectListItem[]>("/projects");
      setSkills(skillsRes.data);
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

  useEffect(() => {
    void load();
  }, [load]);

  const mySkillIds = useMemo(() => new Set(mySkills.map((skill) => skill.skill_id)), [mySkills]);
  const availableToAdd = skills.filter((skill) => !mySkillIds.has(skill.id));

  const loadMemberSkills = useCallback(async (projectId: string) => {
    if (!projectId) {
      setMemberSkills([]);
      return;
    }
    const res = await api.get<MemberSkill[]>(`/projects/${projectId}/member-skills`);
    setMemberSkills(res.data);
  }, []);

  useEffect(() => {
    void loadMemberSkills(selectedProjectId);
  }, [loadMemberSkills, selectedProjectId]);

  function skillName(skillId: number) {
    return skills.find((skill) => skill.id === skillId)?.name ?? `Skill ${skillId}`;
  }

  async function addMySkill() {
    if (!selectedSkillId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/users/me/skills", {
        skill_id: Number(selectedSkillId),
        level: selectedLevel,
      });
      setSelectedSkillId("");
      setSelectedLevel(3);
      setSuccess("Competenta a fost adaugata profilului tau.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut adauga competenta"));
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
      setSuccess("Competenta noua a fost creata.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut crea competenta"));
    } finally {
      setSaving(false);
    }
  }

  async function updateMySkill(skillId: number, level: number) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/users/me/skills/${skillId}`, { level });
      setSuccess("Nivelul competentei a fost actualizat si asteapta validare.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut actualiza competenta"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMySkill(skillId: number) {
    if (!window.confirm("Sigur vrei să ștergi această competență din profilul tău?")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/users/me/skills/${skillId}`);
      setSuccess("Competenta a fost stearsa din profilul tau.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge competenta"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCatalogSkill(skillId: number) {
    if (!window.confirm("Sigur vrei să ștergi această competență din catalog?")) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/skills/${skillId}`);
      setSuccess("Skill-ul a fost sters din catalog.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut sterge skill-ul. Daca este folosit de utilizatori sau task-uri, trebuie pastrat."));
    } finally {
      setSaving(false);
    }
  }

  async function validateMemberSkill(row: MemberSkill, status: "VALIDATED" | "ADJUSTED", level = row.level) {
    if (!selectedProjectId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/projects/${selectedProjectId}/members/${row.user_id}/skills/${row.skill_id}`, { level, validation_status: status });
      setSuccess(status === "VALIDATED" ? "Competenta a fost validata." : "Competenta a fost ajustata.");
      await loadMemberSkills(selectedProjectId);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut valida competenta membrului"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Competențe" eyebrow="Profil și eligibilitate">
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <StarBorderRoundedIcon sx={{ color: accent.value }} />
                  <Typography variant="h6">Skill-urile mele</Typography>
                </Stack>
                <Tooltip title="Nivelurile sunt folosite pentru eligibilitatea la task-uri si pentru distribuirea automata.">
                  <IconButton size="small">
                    <InfoOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="skill-select-label">Adauga un skill</InputLabel>
                  <Select
                    labelId="skill-select-label"
                    label="Adauga un skill"
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

                <TextField
                  label="Nivel"
                  type="number"
                  value={selectedLevel}
                  onChange={(event) => setSelectedLevel(Number(event.target.value))}
                  slotProps={{ htmlInput: { min: 1, max: 5 } }}
                  sx={{ width: { xs: "100%", sm: 130 } }}
                />

                <Button variant="contained" onClick={addMySkill} disabled={!selectedSkillId || saving}>
                  Adauga
                </Button>
              </Stack>

              <Stack spacing={1.25} sx={{ minHeight: 96 }}>
                {mySkills.map((skill) => (
                  <Box
                    key={skill.skill_id}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "#F8FAFC"),
                    }}
                  >
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900 }}>{skillName(skill.skill_id)}</Typography>
                        <Chip size="small" label={`${levelLabel(skill.level)} · ${skill.validation_status}`} sx={{ mt: 0.75, fontWeight: 800 }} />
                      </Box>
                      <Slider min={1} max={5} step={1} marks value={skill.level} onChangeCommitted={(_, value) => void updateMySkill(skill.skill_id, value as number)} sx={{ width: { xs: "100%", sm: 160 } }} />
                      <IconButton color="error" onClick={() => void deleteMySkill(skill.skill_id)} disabled={saving}>
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                ))}
                {mySkills.length === 0 && !loading ? (
                  <Typography sx={{ color: "text.secondary", mx: "auto", mt: 4 }}>Niciun skill adaugat</Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <BuildRoundedIcon sx={{ color: accent.value }} />
                  <Typography variant="h6">Toate skill-urile</Typography>
                </Stack>
                <Tooltip title="Catalogul contine competentele care pot fi atasate profilului sau cerute de task-uri.">
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
                  Adauga
                </Button>
              </Stack>

              <Stack spacing={1.25}>
                {skills.map((skill) => (
                  <Box
                    key={skill.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
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
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Chip size="small" label="Skillbook" sx={{ fontWeight: 800 }} />
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
                <VerifiedRoundedIcon sx={{ color: accent.value }} />
                <Box>
                  <Typography variant="h6">Validare competente membri</Typography>
                  <Typography sx={{ color: "text.secondary" }}>Disponibil pentru proiectele unde esti OWNER sau ADMIN.</Typography>
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
              {memberSkills.map((row) => (
                <Box key={`${row.user_id}-${row.skill_id}`} sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", md: "center" } }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 900 }}>{row.user_name || row.user_email || `User #${row.user_id}`}</Typography>
                      <Typography sx={{ color: "text.secondary", fontSize: 14 }}>{skillName(row.skill_id)} · {levelLabel(row.level)}</Typography>
                    </Box>
                    <Chip label={row.validation_status} sx={{ fontWeight: 900 }} />
                    <Button variant="outlined" onClick={() => void validateMemberSkill(row, "VALIDATED")} disabled={saving}>Valideaza</Button>
                    <Button variant="outlined" onClick={() => void validateMemberSkill(row, "ADJUSTED", Math.min(row.level + 1, 5))} disabled={saving}>Ajusteaza +1</Button>
                  </Stack>
                </Box>
              ))}
              {projects.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Nu administrezi niciun proiect momentan.</Typography> : null}
              {projects.length > 0 && memberSkills.length === 0 ? <Typography sx={{ color: "text.secondary" }}>Membrii proiectului nu au skill-uri personale de validat.</Typography> : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </AppLayout>
  );
}
