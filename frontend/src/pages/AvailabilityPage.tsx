import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import RestoreRoundedIcon from "@mui/icons-material/RestoreRounded";
import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useThemeMode } from "../themeMode";

type AvailabilityWindow = {
  weekday: number;
  start_time: string;
  end_time: string;
};

type AvailabilityOverride = {
  day: string;
  is_unavailable: boolean;
  start_time?: string | null;
  end_time?: string | null;
};

const weekdays = [
  { value: 0, label: "Luni" },
  { value: 1, label: "Marti" },
  { value: 2, label: "Miercuri" },
  { value: 3, label: "Joi" },
  { value: 4, label: "Vineri" },
  { value: 5, label: "Sambata" },
  { value: 6, label: "Duminica" },
];

const standardWorkWeek: AvailabilityWindow[] = [0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  start_time: "09:00",
  end_time: "17:00",
}));

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function isValidTime(value: string | null | undefined) {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export function AvailabilityPage() {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [enabledDays, setEnabledDays] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const windowsByDay = useMemo(() => {
    const map = new Map<number, AvailabilityWindow[]>();
    windows.forEach((window) => {
      map.set(window.weekday, [...(map.get(window.weekday) ?? []), window]);
    });
    return map;
  }, [windows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [windowsRes, overridesRes] = await Promise.all([
        api.get<AvailabilityWindow[]>("/users/me/availability-windows"),
        api.get<AvailabilityOverride[]>("/users/me/availability-overrides"),
      ]);
      const normalized = windowsRes.data.map((window) => ({
        weekday: window.weekday,
        start_time: normalizeTime(window.start_time),
        end_time: normalizeTime(window.end_time),
      }));
      const initialWindows = normalized.length ? normalized : standardWorkWeek;
      setWindows(initialWindows);
      setOverrides(
        overridesRes.data.map((override) => ({
          ...override,
          start_time: override.start_time ? normalizeTime(override.start_time) : null,
          end_time: override.end_time ? normalizeTime(override.end_time) : null,
        }))
      );
      setEnabledDays(Object.fromEntries(weekdays.map((day) => [day.value, initialWindows.some((window) => window.weekday === day.value)])));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca disponibilitatea"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function sortWindows(items: AvailabilityWindow[]) {
    return [...items].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  }

  function updateWindow(index: number, patch: Partial<AvailabilityWindow>) {
    setWindows((current) => current.map((window, itemIndex) => (itemIndex === index ? { ...window, ...patch } : window)));
  }

  function addWindow(day: number) {
    setEnabledDays((current) => ({ ...current, [day]: true }));
    setWindows((current) => [...current, { weekday: day, start_time: "09:00", end_time: "17:00" }]);
  }

  function removeWindow(index: number) {
    if (!window.confirm("Sigur vrei să ștergi acest interval de disponibilitate?")) return;
    setWindows((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function applyStandardWorkWeek() {
    setWindows(standardWorkWeek);
    setEnabledDays(Object.fromEntries(weekdays.map((day) => [day.value, day.value <= 4])));
    setSuccess(null);
    setError(null);
  }

  function toggleDay(day: number, checked: boolean) {
    setEnabledDays((current) => ({ ...current, [day]: checked }));
    if (checked && !(windowsByDay.get(day)?.length)) {
      addWindow(day);
    }
  }

  function validateWindows(items: AvailabilityWindow[]) {
    const active = sortWindows(items.filter((window) => enabledDays[window.weekday]));
    for (const window of active) {
      if (!isValidTime(window.start_time) || !isValidTime(window.end_time)) return "Orele trebuie introduse in format 24h: HH:mm, de exemplu 09:00 sau 17:30.";
      if (window.start_time >= window.end_time) return "Intervalele de disponibilitate trebuie sa aiba ora de inceput mai mica decat ora de final.";
    }
    for (let index = 1; index < active.length; index += 1) {
      const previous = active[index - 1];
      const current = active[index];
      if (previous.weekday === current.weekday && current.start_time < previous.end_time) {
        return `Intervalele pentru ${weekdays.find((day) => day.value === current.weekday)?.label ?? "zi"} se suprapun.`;
      }
    }
    return null;
  }

  function isOverrideInsideAvailability(override: AvailabilityOverride) {
    if (override.is_unavailable) return true;
    if (!isValidTime(override.start_time) || !isValidTime(override.end_time)) return false;
    if (!override.start_time || !override.end_time) return false;
    const day = new Date(`${override.day}T00:00:00`).getDay();
    const weekday = day === 0 ? 6 : day - 1;
    const dayWindows = windows.filter((window) => enabledDays[window.weekday] && window.weekday === weekday);
    return dayWindows.some((window) => window.start_time <= override.start_time! && override.end_time! <= window.end_time);
  }

  async function save() {
    const validationError = validateWindows(windows);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      windows: sortWindows(windows)
        .filter((window) => enabledDays[window.weekday])
        .map((window) => ({
          weekday: window.weekday,
          start_time: window.start_time,
          end_time: window.end_time,
        })),
    };

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.put("/users/me/availability-windows", payload);
      setSuccess("Disponibilitatea a fost salvata.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut salva disponibilitatea"));
    } finally {
      setSaving(false);
    }
  }

  function addOverride() {
    setOverrides((current) => [
      ...current,
      {
        day: new Date().toISOString().slice(0, 10),
        is_unavailable: true,
        start_time: "09:00",
        end_time: "17:00",
      },
    ]);
  }

  function updateOverride(index: number, patch: Partial<AvailabilityOverride>) {
    setOverrides((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeOverride(index: number) {
    if (!window.confirm("Sigur vrei să ștergi această excepție de disponibilitate?")) return;
    setOverrides((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveOverrides() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const invalidOverride = overrides.find((override) => !isOverrideInsideAvailability(override));
    if (invalidOverride) {
      setSaving(false);
      setError(`Exceptia din ${invalidOverride.day} trebuie sa fie in interiorul unui interval de disponibilitate setat pentru ziua respectiva.`);
      return;
    }

    const payload = {
      overrides: overrides.map((override) => ({
        day: override.day,
        is_unavailable: override.is_unavailable,
        start_time: override.is_unavailable ? null : override.start_time,
        end_time: override.is_unavailable ? null : override.end_time,
      })),
    };

    try {
      await api.put("/users/me/availability-overrides", payload);
      setSuccess("Exceptiile au fost salvate.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut salva exceptiile"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="Disponibilitate" eyebrow="Planificare personala">
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2.5, alignItems: "start" }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
                <AccessTimeRoundedIcon sx={{ color: "primary.main" }} />
                <Typography variant="h6">Program saptamanal</Typography>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
                <Button variant="outlined" startIcon={<RestoreRoundedIcon />} onClick={applyStandardWorkWeek}>
                  Program standard 09:00-17:00
                </Button>
              </Stack>

              <Stack spacing={1.5}>
                {weekdays.map((day) => {
                  const dayWindows = windowsByDay.get(day.value) ?? [];
                  const enabled = Boolean(enabledDays[day.value]);

                  return (
                    <Box
                      key={day.value}
                      sx={{
                        display: "grid",
                        gap: 1.5,
                        p: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        bgcolor: enabled ? (isDark ? "rgba(255,255,255,0.04)" : "#fff") : isDark ? "rgba(15,23,42,0.34)" : "rgba(17,24,39,0.02)",
                        opacity: enabled ? 1 : 0.72,
                      }}
                    >
                      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 1 }}>
                        <FormControlLabel
                          control={<Switch checked={enabled} onChange={(event) => toggleDay(day.value, event.target.checked)} />}
                          label={<Typography sx={{ fontWeight: 800 }}>{day.label}</Typography>}
                        />
                        <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => addWindow(day.value)} disabled={!enabled}>
                          Adauga interval
                        </Button>
                      </Stack>
                      <Stack spacing={1}>
                        {dayWindows.map((item) => {
                          const index = windows.indexOf(item);
                          return (
                            <Stack key={`${item.weekday}-${index}`} direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
                              <TextField
                                label="De la"
                                value={item.start_time}
                                disabled={!enabled}
                                onChange={(event) => updateWindow(index, { start_time: event.target.value })}
                                placeholder="09:00"
                                error={Boolean(item.start_time) && !isValidTime(item.start_time)}
                                helperText={Boolean(item.start_time) && !isValidTime(item.start_time) ? "Format HH:mm" : " "}
                                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{2}:[0-9]{2}" } }}
                                fullWidth
                              />
                              <Typography sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }}>-</Typography>
                              <TextField
                                label="Pana la"
                                value={item.end_time}
                                disabled={!enabled}
                                onChange={(event) => updateWindow(index, { end_time: event.target.value })}
                                placeholder="17:00"
                                error={Boolean(item.end_time) && !isValidTime(item.end_time)}
                                helperText={Boolean(item.end_time) && !isValidTime(item.end_time) ? "Format HH:mm" : " "}
                                slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{2}:[0-9]{2}" } }}
                                fullWidth
                              />
                              <IconButton color="error" onClick={() => removeWindow(index)} disabled={!enabled || dayWindows.length <= 1} aria-label="Sterge interval">
                                <DeleteOutlineRoundedIcon />
                              </IconButton>
                            </Stack>
                          );
                        })}
                        {enabled && dayWindows.length === 0 ? (
                          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Adauga cel putin un interval pentru aceasta zi.</Typography>
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={save} disabled={saving}>
                  {saving ? "Se salveaza..." : "Salveaza"}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
                <EventBusyRoundedIcon sx={{ color: "error.main" }} />
                <Typography variant="h6">Exceptii (Override)</Typography>
              </Stack>

              <Stack spacing={1.5}>
                {overrides.map((override, index) => (
                  <Box
                    key={`${override.day}-${index}`}
                    sx={{
                      p: 2,
                      border: "1px solid",
                      borderColor: isDark ? "divider" : "rgba(239,68,68,0.16)",
                      borderRadius: 2,
                      bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(220,38,38,0.04)",
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: "column", lg: "row" }}
                        spacing={1.5}
                        sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between" }}
                      >
                        <TextField
                          label="Zi"
                          type="date"
                          value={override.day}
                          onChange={(event) => updateOverride(index, { day: event.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }}
                          sx={{ minWidth: { lg: 210 } }}
                        />

                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "space-between", lg: "flex-end" } }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={override.is_unavailable}
                                onChange={(event) => updateOverride(index, { is_unavailable: event.target.checked })}
                              />
                            }
                            label={<Typography sx={{ fontWeight: 800 }}>Zi indisponibila</Typography>}
                            labelPlacement="start"
                            sx={{ m: 0 }}
                          />
                          <IconButton color="error" onClick={() => removeOverride(index)} aria-label="Sterge exceptia">
                            <DeleteOutlineRoundedIcon />
                          </IconButton>
                        </Stack>
                      </Stack>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
                        <TextField
                          label="De la"
                          value={override.start_time ?? "09:00"}
                          disabled={override.is_unavailable}
                          onChange={(event) => updateOverride(index, { start_time: event.target.value })}
                          placeholder="09:00"
                          error={!override.is_unavailable && Boolean(override.start_time) && !isValidTime(override.start_time)}
                          helperText={!override.is_unavailable && Boolean(override.start_time) && !isValidTime(override.start_time) ? "Format HH:mm" : " "}
                          slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{2}:[0-9]{2}" } }}
                          fullWidth
                        />
                        <Typography sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }}>-</Typography>
                        <TextField
                          label="Pana la"
                          value={override.end_time ?? "17:00"}
                          disabled={override.is_unavailable}
                          onChange={(event) => updateOverride(index, { end_time: event.target.value })}
                          placeholder="17:00"
                          error={!override.is_unavailable && Boolean(override.end_time) && !isValidTime(override.end_time)}
                          helperText={!override.is_unavailable && Boolean(override.end_time) && !isValidTime(override.end_time) ? "Format HH:mm" : " "}
                          slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]{2}:[0-9]{2}" } }}
                          fullWidth
                        />
                      </Stack>
                    </Stack>
                  </Box>
                ))}

                {overrides.length === 0 ? (
                  <Typography sx={{ color: "text.secondary" }}>
                    Nu există excepții. Programul săptămânal se aplică fără modificări.
                  </Typography>
                ) : null}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addOverride}>
                  Adauga exceptie
                </Button>
                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveOverrides} disabled={saving}>
                  Salveaza
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </AppLayout>
  );
}
