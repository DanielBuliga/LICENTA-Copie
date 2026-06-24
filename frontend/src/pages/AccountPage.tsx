import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { clearToken } from "../api/auth";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useConfirmDialog } from "../components/useConfirmDialog";
import { useAccentColor } from "../hooks/useAccentColor";
import { useThemeMode } from "../themeMode";

type CurrentUser = {
  id: number;
  email: string;
  name?: string | null;
};

type NotificationPreferences = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  deadline_reminders_enabled: boolean;
  deadline_reminder_hours: number[];
  project_events_enabled: boolean;
  assignment_events_enabled: boolean;
  message_events_enabled: boolean;
  ready_to_close_enabled: boolean;
  project_completed_enabled: boolean;
};

function SettingSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 1.5,
        alignItems: "center",
        p: 1.25,
        borderRadius: 2,
        bgcolor: "background.default",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography sx={{ fontWeight: 850 }}>{label}</Typography>
      <Switch size="small" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </Box>
  );
}

export function AccountPage() {
  const nav = useNavigate();
  const accent = useAccentColor();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { mode, toggleMode, designVariant, setDesignVariant } = useThemeMode();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [newReminderHour, setNewReminderHour] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reminderHours = useMemo(
    () => [...(prefs?.deadline_reminder_hours ?? [])].sort((a, b) => b - a),
    [prefs?.deadline_reminder_hours]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CurrentUser>("/users/me");
      setUser(res.data);
      try {
        const prefsRes = await api.get<NotificationPreferences>("/users/me/notification-preferences");
        setPrefs(prefsRes.data);
      } catch (err: unknown) {
        setPrefs(null);
        setError(getApiErrorMessage(err, "Setările de notificare nu sunt disponibile. Verifică migrarea bazei de date."));
      }
    } catch (err: unknown) {
      setUser(null);
      setError(getApiErrorMessage(err, "Nu am putut încărca datele contului."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function logout() {
    clearToken();
    nav("/login");
  }

  async function deleteAccount() {
    const firstConfirm = await confirm({
      title: "Dezactivare cont",
      description: "Sigur vrei să dezactivezi contul? Nu te vei mai putea autentifica, iar istoricul din proiecte va fi păstrat.",
      confirmLabel: "Continuă",
    });
    if (!firstConfirm) return;

    const secondConfirm = await confirm({
      title: "Confirmare finală",
      description: "Confirmi dezactivarea contului curent?",
      confirmLabel: "Dezactivează contul",
    });
    if (!secondConfirm) return;

    setLoading(true);
    setError(null);
    try {
      await api.delete("/users/me");
      clearToken();
      nav("/login", { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut dezactiva contul."));
    } finally {
      setLoading(false);
    }
  }

  async function updatePrefs(patch: Partial<NotificationPreferences>) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.patch<NotificationPreferences>("/users/me/notification-preferences", patch);
      setPrefs(res.data);
      setMessage("Setările de notificare au fost salvate.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut salva setările de notificare."));
    } finally {
      setLoading(false);
    }
  }

  function updateReminderInput(value: string) {
    setReminderError(null);
    setNewReminderHour(value.replace(/\D/g, ""));
  }

  function addReminderHour() {
    const value = Number(newReminderHour);
    if (!newReminderHour || !Number.isInteger(value) || value <= 0 || value > 720) {
      setReminderError("Introdu un număr întreg între 1 și 720.");
      return;
    }
    if (reminderHours.includes(value)) {
      setReminderError("Intervalul există deja.");
      return;
    }

    const next = [...reminderHours, value].sort((a, b) => b - a);
    setNewReminderHour("");
    setReminderError(null);
    void updatePrefs({ deadline_reminder_hours: next });
  }

  function removeReminderHour(value: number) {
    setReminderError(null);
    void updatePrefs({ deadline_reminder_hours: reminderHours.filter((hour) => hour !== value) });
  }

  const displayName = user?.name?.trim() || user?.email || "Cont conectat";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <AppLayout title="Contul meu">
      <Stack spacing={2.5} sx={{ maxWidth: 900 }}>
        {loading ? <LinearProgress /> : null}
        {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}
        {error ? <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert> : null}

        <Card>
          <CardContent sx={{ p: 3.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} sx={{ alignItems: { xs: "flex-start", sm: "center" } }}>
              <Avatar sx={{ width: 72, height: 72, bgcolor: accent.soft, color: accent.text, fontWeight: 950, fontSize: 28 }}>
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 950 }} noWrap>
                  {displayName}
                </Typography>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 1, minWidth: 0 }}>
                  <MailOutlineRoundedIcon sx={{ color: "text.secondary", fontSize: 19 }} />
                  <Typography sx={{ color: "text.secondary", overflowWrap: "anywhere" }}>
                    {user?.email ?? "indisponibil"}
                  </Typography>
                </Stack>
              </Box>
              <Chip label="Conectat" sx={{ bgcolor: accent.soft, color: accent.text, fontWeight: 900 }} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 2 }}>
              <Box>
                <Typography variant="h6">Acțiuni cont</Typography>
                <Typography sx={{ color: "text.secondary" }}>Deconectare sau dezactivare cont.</Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <Button variant="outlined" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={logout} sx={{ minWidth: 154 }}>
                  Deconectare
                </Button>
                <Button variant="contained" color="error" startIcon={<DeleteForeverRoundedIcon />} onClick={() => void deleteAccount()} disabled={loading} sx={{ minWidth: 154 }}>
                  Șterge contul
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {prefs ? (
          <Card>
            <CardContent sx={{ p: 3.5 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
                <NotificationsNoneRoundedIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography variant="h6">Notificări</Typography>
                  <Typography sx={{ color: "text.secondary" }}>Canale și evenimente urmărite.</Typography>
                </Box>
              </Stack>

              <Stack spacing={2}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25 }}>
                  <SettingSwitch label="În aplicație" checked={prefs.in_app_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ in_app_enabled: checked })} />
                  <SettingSwitch label="Email" checked={prefs.email_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ email_enabled: checked })} />
                </Box>

                <Divider />

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25 }}>
                  <SettingSwitch label="Adăugare în proiect" checked={prefs.project_events_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ project_events_enabled: checked })} />
                  <SettingSwitch label="Asignare taskuri" checked={prefs.assignment_events_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ assignment_events_enabled: checked })} />
                  <SettingSwitch label="Mesaje noi" checked={prefs.message_events_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ message_events_enabled: checked })} />
                  <SettingSwitch label="Task gata de verificare" checked={prefs.ready_to_close_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ ready_to_close_enabled: checked })} />
                  <SettingSwitch label="Proiect finalizat" checked={prefs.project_completed_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ project_completed_enabled: checked })} />
                  <SettingSwitch label="Reminder-e deadline" checked={prefs.deadline_reminders_enabled} disabled={loading} onChange={(checked) => void updatePrefs({ deadline_reminders_enabled: checked })} />
                </Box>

                <Box sx={{ p: 2, borderRadius: 2, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-start" } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 950 }}>Intervale deadline</Typography>
                      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Ore înainte de deadline.</Typography>
                    </Box>
                    <Stack spacing={1} sx={{ minWidth: { xs: "100%", sm: 300 } }}>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Ore"
                          value={newReminderHour}
                          onChange={(event) => updateReminderInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (["e", "E", "+", "-", ".", ",", " "].includes(event.key)) event.preventDefault();
                            if (event.key === "Enter") addReminderHour();
                          }}
                          slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
                          size="small"
                          fullWidth
                          error={Boolean(reminderError)}
                        />
                        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={addReminderHour} disabled={loading || !newReminderHour.trim()} sx={{ minWidth: 112 }}>
                          Adaugă
                        </Button>
                      </Stack>
                      {reminderError ? (
                        <Alert severity="warning" sx={{ py: 0.5, alignItems: "center" }}>
                          {reminderError}
                        </Alert>
                      ) : null}
                    </Stack>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", rowGap: 1 }}>
                    {reminderHours.map((hour) => (
                      <Chip
                        key={hour}
                        label={`${hour}h`}
                        onDelete={() => removeReminderHour(hour)}
                        deleteIcon={<CloseRoundedIcon />}
                        sx={{ bgcolor: accent.soft, color: accent.text, fontWeight: 900 }}
                      />
                    ))}
                    {reminderHours.length === 0 ? (
                      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Nu există intervale configurate.</Typography>
                    ) : null}
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
              <PaletteOutlinedIcon sx={{ color: "text.secondary" }} />
              <Box>
                <Typography variant="h6">Personalizare interfață</Typography>
                <Typography sx={{ color: "text.secondary" }}>Tema și stilul panourilor.</Typography>
              </Box>
            </Stack>

            <Stack spacing={1.75}>
              <Box>
                <Typography sx={{ fontWeight: 900, mb: 0.75 }}>Tema aplicației</Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={mode}
                  onChange={(_, value) => {
                    if (value && value !== mode) toggleMode();
                  }}
                  sx={{
                    p: 0.4,
                    borderRadius: 2,
                    bgcolor: "background.default",
                    border: "1px solid",
                    borderColor: "divider",
                    "& .MuiToggleButton-root": {
                      border: 0,
                      borderRadius: 1.3,
                      px: 1.35,
                      py: 0.65,
                      fontWeight: 850,
                      color: "text.secondary",
                      "&.Mui-selected": { bgcolor: accent.value, color: "#fff" },
                    },
                  }}
                >
                  <ToggleButton value="light"><LightModeRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />Luminos</ToggleButton>
                  <ToggleButton value="dark"><DarkModeRoundedIcon sx={{ mr: 0.75, fontSize: 18 }} />Întunecat</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box>
                <Typography sx={{ fontWeight: 900, mb: 0.75 }}>Stil panouri</Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={designVariant}
                  onChange={(_, value) => {
                    if (value) setDesignVariant(value);
                  }}
                  sx={{
                    p: 0.4,
                    borderRadius: 2,
                    bgcolor: "background.default",
                    border: "1px solid",
                    borderColor: "divider",
                    "& .MuiToggleButton-root": {
                      border: 0,
                      borderRadius: 1.3,
                      px: 1.35,
                      py: 0.65,
                      fontWeight: 850,
                      color: "text.secondary",
                      "&.Mui-selected": { bgcolor: accent.value, color: "#fff" },
                    },
                  }}
                >
                  <ToggleButton value="standard">Actual</ToggleButton>
                  <ToggleButton value="glass">Glass</ToggleButton>
                  <ToggleButton value="blurGlass">Sticlă mată</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
      {confirmDialog}
    </AppLayout>
  );
}
