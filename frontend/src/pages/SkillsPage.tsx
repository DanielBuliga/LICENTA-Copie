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
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useConfirmDialog } from "../components/useConfirmDialog";
import { useAccentColor } from "../hooks/useAccentColor";

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

const MIN_SKILL_NAME_LENGTH = 2;
const MAX_SKILL_NAME_LENGTH = 100;
const MIN_ALIAS_LENGTH = 2;
const MAX_ALIAS_LENGTH = 120;

function normalizeTerm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function SkillsPage() {
  const accent = useAccentColor();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [aliasesBySkill, setAliasesBySkill] = useState<Record<number, SkillAlias[]>>({});
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
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
      const [skillsRes, mySkillsRes] = await Promise.all([
        api.get<Skill[]>("/skills"),
        api.get<UserSkill[]>("/users/me/skills"),
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
  const normalizedSkillNames = useMemo(() => new Set(skills.map((skill) => normalizeTerm(skill.name))), [skills]);
  const newSkillNameNormalized = normalizeTerm(newSkillName);
  const newSkillNameLength = newSkillName.trim().length;
  const newSkillError = (() => {
    if (!newSkillName.trim()) return "";
    if (newSkillNameLength < MIN_SKILL_NAME_LENGTH) return "Numele trebuie să aibă cel puțin 2 caractere.";
    if (newSkillNameLength > MAX_SKILL_NAME_LENGTH) return "Numele poate avea cel mult 100 de caractere.";
    if (normalizedSkillNames.has(newSkillNameNormalized)) return "Această competență există deja.";
    return "";
  })();

  function skillName(skillId: number) {
    return skills.find((skill) => skill.id === skillId)?.name ?? `Skill ${skillId}`;
  }

  function aliasError(skill: Skill) {
    const alias = newAliasBySkill[skill.id] ?? "";
    const normalizedAlias = normalizeTerm(alias);
    if (!alias.trim()) return "";
    if (alias.trim().length < MIN_ALIAS_LENGTH) return "Aliasul trebuie să aibă cel puțin 2 caractere.";
    if (alias.trim().length > MAX_ALIAS_LENGTH) return "Aliasul poate avea cel mult 120 de caractere.";
    if (normalizedAlias === normalizeTerm(skill.name)) return "Aliasul nu poate fi identic cu numele competenței.";
    if ((aliasesBySkill[skill.id] ?? []).some((item) => normalizeTerm(item.alias) === normalizedAlias)) {
      return "Acest alias există deja.";
    }
    return "";
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
    if (!name || newSkillError) return;

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
    const skill = skills.find((item) => item.id === skillId);
    if (!alias || !skill || aliasError(skill)) return;

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
                  <Typography variant="h6">Competențele mele</Typography>
                </Stack>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
                <FormControl fullWidth>
                  <InputLabel id="skill-select-label">Adaugă o competență</InputLabel>
                  <Select
                    labelId="skill-select-label"
                    label="Adaugă o competență"
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
                  <Typography sx={{ color: "text.secondary", mx: "auto", mt: 4 }}>Nicio competență adăugată</Typography>
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
                  <Typography variant="h6">Skillbook</Typography>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", mb: 2 }}>
                <TextField
                  label="Nume skill nou"
                  value={newSkillName}
                  onChange={(event) => setNewSkillName(event.target.value)}
                  error={Boolean(newSkillError)}
                  helperText={newSkillError || " "}
                  slotProps={{ htmlInput: { maxLength: MAX_SKILL_NAME_LENGTH } }}
                  fullWidth
                />
                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={createSkill}
                  disabled={!newSkillName.trim() || Boolean(newSkillError) || saving}
                  sx={{ minWidth: 116, height: 56, flex: "0 0 auto" }}
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
                {skills.map((skill) => {
                  const currentAliasError = aliasError(skill);
                  return (
                  <Box
                    key={skill.id}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.25,
                      px: 2,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "#F8FAFC"),
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
                      <Typography sx={{ fontWeight: 900, minWidth: 0, overflowWrap: "anywhere" }}>{skill.name}</Typography>
                      <IconButton color="error" onClick={() => void deleteCatalogSkill(skill.id)} disabled={saving} sx={{ mt: -0.75, mr: -0.75, flex: "0 0 auto" }}>
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Stack>

                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", minHeight: 32 }}>
                      {(aliasesBySkill[skill.id] ?? []).map((alias) => (
                        <Chip
                          key={alias.id}
                          size="small"
                          label={alias.alias}
                          onDelete={() => void deleteAlias(skill.id, alias.id)}
                          sx={{ fontWeight: 800 }}
                        />
                      ))}
                      {(aliasesBySkill[skill.id] ?? []).length === 0 ? (
                        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Fără aliasuri.</Typography>
                      ) : null}
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                      <TextField
                        size="small"
                        label="Alias"
                        value={newAliasBySkill[skill.id] ?? ""}
                        onChange={(event) => setNewAliasBySkill((current) => ({ ...current, [skill.id]: event.target.value }))}
                        error={Boolean(currentAliasError)}
                        helperText={currentAliasError || " "}
                        slotProps={{ htmlInput: { maxLength: MAX_ALIAS_LENGTH } }}
                        sx={{ flex: 1, minWidth: 0 }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void addAlias(skill.id)}
                        disabled={!(newAliasBySkill[skill.id] ?? "").trim() || Boolean(currentAliasError) || saving}
                        sx={{ height: 40, minWidth: 84, flex: "0 0 auto" }}
                      >
                        Adaugă
                      </Button>
                    </Stack>
                  </Box>
                  );
                })}
                {skills.length === 0 && !loading ? (
                  <Typography sx={{ color: "text.secondary" }}>Nu există competențe definite.</Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
      {confirmDialog}
    </AppLayout>
  );
}
