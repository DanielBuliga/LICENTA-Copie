import { useCallback, useEffect, useState } from "react";
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Divider, FormControlLabel, LinearProgress, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import { useNavigate } from "react-router-dom";

import { api } from "../api/api";
import { clearToken } from "../api/auth";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
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

export function AccountPage() {
  const nav = useNavigate();
  const accent = useAccentColor();
  const { designVariant, setDesignVariant } = useThemeMode();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [reminderHours, setReminderHours] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CurrentUser>("/users/me");
      setUser(res.data);
      try {
        const prefsRes = await api.get<NotificationPreferences>("/users/me/notification-preferences");
        setPrefs(prefsRes.data);
        setReminderHours(prefsRes.data.deadline_reminder_hours.join(", "));
      } catch (err: unknown) {
        setPrefs(null);
        setError(getApiErrorMessage(err, "Setarile de notificare nu sunt disponibile. Verifica migrarea bazei de date."));
      }
    } catch (err: unknown) {
      setUser(null);
      setError(getApiErrorMessage(err, "Nu am putut încărca datele contului"));
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
    const firstConfirm = window.confirm("Sigur vrei să ștergi contul? Contul va fi dezactivat, nu te vei mai putea autentifica, iar istoricul din proiecte va fi păstrat.");
    if (!firstConfirm) return;
    const secondConfirm = window.confirm("Confirmare finală: dezactivezi contul curent?");
    if (!secondConfirm) return;

    setLoading(true);
    setError(null);
    try {
      await api.delete("/users/me");
      clearToken();
      nav("/login", { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut șterge contul"));
    } finally {
      setLoading(false);
    }
  }

  async function updatePrefs(patch: Partial<NotificationPreferences>) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.patch<NotificationPreferences>("/users/me/notification-preferences", patch);
      setPrefs(res.data);
      setReminderHours(res.data.deadline_reminder_hours.join(", "));
      setMessage("Setarile de notificare au fost salvate.");
    } finally {
      setLoading(false);
    }
  }

  function saveReminderHours() {
    const hours = reminderHours.split(",").map((item) => Number(item.trim())).filter((value) => Number.isFinite(value) && value > 0);
    void updatePrefs({ deadline_reminder_hours: hours });
  }

  const displayName = user?.name?.trim() || user?.email || "Cont conectat";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <AppLayout title="Contul meu">
      <Stack spacing={2.5} sx={{ maxWidth: 820 }}>
        {loading ? <LinearProgress /> : null}
        {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}
        {error ? <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert> : null}
        <Card>
          <CardContent sx={{ p: 3.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} sx={{ alignItems: { xs: "flex-start", sm: "center" } }}>
              <Avatar sx={{ width: 72, height: 72, bgcolor: accent.soft, color: accent.text, fontWeight: 950, fontSize: 28 }}>
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 950 }}>
                  {displayName}
                </Typography>
                <Chip label="Utilizator conectat" sx={{ mt: 1, bgcolor: accent.soft, color: accent.text, fontWeight: 900 }} />
              </Box>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={2}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <MailOutlineRoundedIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Email</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{user?.email ?? "indisponibil"}</Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <BadgeOutlinedIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography sx={{ color: "text.secondary", fontSize: 13 }}>ID utilizator</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{user?.id ?? "-"}</Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <ShieldOutlinedIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography sx={{ color: "text.secondary", fontSize: 13 }}>Sesiune</Typography>
                  <Typography sx={{ fontWeight: 800 }}>Token local activ pe acest dispozitiv</Typography>
                </Box>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 2 }}>
              <Box>
                <Typography variant="h6">Acțiuni cont</Typography>
                <Typography sx={{ color: "text.secondary" }}>Ieși din sesiunea curentă sau dezactivează contul. Istoricul din proiecte va fi păstrat.</Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="outlined" color="error" startIcon={<LogoutRoundedIcon />} onClick={logout}>
                  Deconectare
                </Button>
                <Button variant="contained" color="error" startIcon={<DeleteForeverRoundedIcon />} onClick={() => void deleteAccount()} disabled={loading}>
                  Șterge contul
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {prefs ? (
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
                <NotificationsNoneRoundedIcon sx={{ color: "text.secondary" }} />
                <Box>
                  <Typography variant="h6">Notificări</Typography>
                  <Typography sx={{ color: "text.secondary" }}>Controleaza canalele, tipurile de notificari si reminder-ele de deadline.</Typography>
                </Box>
              </Stack>

              <Stack spacing={1}>
                <FormControlLabel control={<Switch checked={prefs.in_app_enabled} onChange={(event) => void updatePrefs({ in_app_enabled: event.target.checked })} />} label="Notificări în aplicație" />
                <FormControlLabel control={<Switch checked={prefs.email_enabled} onChange={(event) => void updatePrefs({ email_enabled: event.target.checked })} />} label="Notificări prin email" />
                <Divider sx={{ my: 1 }} />
                <FormControlLabel control={<Switch checked={prefs.project_events_enabled} onChange={(event) => void updatePrefs({ project_events_enabled: event.target.checked })} />} label="Adaugare in proiect" />
                <FormControlLabel control={<Switch checked={prefs.assignment_events_enabled} onChange={(event) => void updatePrefs({ assignment_events_enabled: event.target.checked })} />} label="Asignare task-uri" />
                <FormControlLabel control={<Switch checked={prefs.message_events_enabled} onChange={(event) => void updatePrefs({ message_events_enabled: event.target.checked })} />} label="Mesaje noi in proiecte" />
                <FormControlLabel control={<Switch checked={prefs.ready_to_close_enabled} onChange={(event) => void updatePrefs({ ready_to_close_enabled: event.target.checked })} />} label="Task ready to close pentru owner" />
                <FormControlLabel control={<Switch checked={prefs.project_completed_enabled} onChange={(event) => void updatePrefs({ project_completed_enabled: event.target.checked })} />} label="Proiect finalizat" />
                <FormControlLabel control={<Switch checked={prefs.deadline_reminders_enabled} onChange={(event) => void updatePrefs({ deadline_reminders_enabled: event.target.checked })} />} label="Reminder-e deadline" />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pt: 1 }}>
                  <TextField label="Intervale reminder deadline (ore)" value={reminderHours} onChange={(event) => setReminderHours(event.target.value)} helperText="Exemplu: 72, 24, 6, 1" fullWidth />
                  <Button variant="outlined" onClick={saveReminderHours} disabled={loading}>Salveaza intervale</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
              <PaletteOutlinedIcon sx={{ color: "text.secondary" }} />
              <Box>
                <Typography variant="h6">Personalizare interfata</Typography>
                <Typography sx={{ color: "text.secondary" }}>Alege aspectul panourilor si casetelor.</Typography>
              </Box>
            </Stack>

            <ToggleButtonGroup
              exclusive
              value={designVariant}
              onChange={(_, value) => {
                if (value) setDesignVariant(value);
              }}
              sx={{
                p: 0.5,
                borderRadius: 2,
                bgcolor: "background.default",
                border: "1px solid",
                borderColor: "divider",
                "& .MuiToggleButton-root": {
                  border: 0,
                  borderRadius: 1.5,
                  px: 2,
                  fontWeight: 900,
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: accent.value,
                    color: "#fff",
                  },
                },
              }}
            >
              <ToggleButton value="standard">Actual</ToggleButton>
              <ToggleButton value="glass">Glass</ToggleButton>
              <ToggleButton value="blurGlass">Sticla mata</ToggleButton>
            </ToggleButtonGroup>
          </CardContent>
        </Card>
      </Stack>
    </AppLayout>
  );
}
