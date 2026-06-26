import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { useConfirmDialog } from "../components/useConfirmDialog";
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
  draft_id?: string;
};

const weekdays = [
  { value: 0, label: "Luni" },
  { value: 1, label: "Marți" },
  { value: 2, label: "Miercuri" },
  { value: 3, label: "Joi" },
  { value: 4, label: "Vineri" },
  { value: 5, label: "Sâmbătă" },
  { value: 6, label: "Duminică" },
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

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastDay(day: string) {
  return day < localDateInputValue();
}

function formatDisplayDate(day: string) {
  const parsed = dayjs(day);
  return parsed.isValid() ? parsed.format("DD.MM.YYYY") : day;
}

function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortOverrides(items: AvailabilityOverride[]) {
  return [...items].sort((a, b) => {
    const dayCompare = a.day.localeCompare(b.day);
    if (dayCompare !== 0) return dayCompare;
    if (a.is_unavailable !== b.is_unavailable) return a.is_unavailable ? -1 : 1;
    const startCompare = (a.start_time ?? "").localeCompare(b.start_time ?? "");
    if (startCompare !== 0) return startCompare;
    return (a.end_time ?? "").localeCompare(b.end_time ?? "");
  });
}

export function AvailabilityPage() {
  const { mode } = useThemeMode();
  const { confirm, confirmDialog } = useConfirmDialog();
  const isDark = mode === "dark";
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [enabledDays, setEnabledDays] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingWindows, setSavingWindows] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const windowEndRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const overridesListRef = useRef<HTMLDivElement | null>(null);
  const windowsByDay = useMemo(() => {
    const map = new Map<number, AvailabilityWindow[]>();
    windows.forEach((window) => {
      map.set(window.weekday, [...(map.get(window.weekday) ?? []), window]);
    });
    return map;
  }, [windows]);

  function scrollOverridesToTop() {
    window.setTimeout(() => {
      overridesListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }

  function scrollOverridesToBottom() {
    window.setTimeout(() => {
      const list = overridesListRef.current;
      list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }, 0);
  }

  const normalizeOverrides = useCallback(
    (items: AvailabilityOverride[]) =>
      sortOverrides(items.map((override) => ({
        ...override,
        draft_id: createDraftId(),
        start_time: override.start_time ? normalizeTime(override.start_time) : null,
        end_time: override.end_time ? normalizeTime(override.end_time) : null,
      }))),
    []
  );

  const loadOverrides = useCallback(async () => {
    const overridesRes = await api.get<AvailabilityOverride[]>("/users/me/availability-overrides");
    setOverrides(normalizeOverrides(overridesRes.data));
  }, [normalizeOverrides]);

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
      setOverrides(normalizeOverrides(overridesRes.data));
      setEnabledDays(Object.fromEntries(weekdays.map((day) => [day.value, initialWindows.some((window) => window.weekday === day.value)])));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca disponibilitatea"));
    } finally {
      setLoading(false);
    }
  }, [normalizeOverrides]);

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
    window.setTimeout(() => {
      windowEndRefs.current[day]?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 0);
  }

  async function removeWindow(index: number) {
    const confirmed = await confirm({
      title: "Ștergere interval",
      description: "Sigur vrei să ștergi acest interval de disponibilitate?",
      confirmLabel: "Șterge intervalul",
    });
    if (!confirmed) return;
    setWindows((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function applyStandardWorkWeek() {
    setWindows(standardWorkWeek);
    setEnabledDays(Object.fromEntries(weekdays.map((day) => [day.value, day.value <= 4])));
    setSuccess(null);
    setError(null);
    setErrorDialog(null);
  }

  function showValidationError(message: string) {
    setError(null);
    setErrorDialog(message);
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

  function overrideOverlapsAvailability(override: AvailabilityOverride) {
    if (!override.day || !override.start_time || !override.end_time) return false;
    const day = new Date(`${override.day}T00:00:00`).getDay();
    const weekday = day === 0 ? 6 : day - 1;
    const dayWindows = windows.filter((window) => enabledDays[window.weekday] && window.weekday === weekday);
    return dayWindows.some((window) => override.start_time! < window.end_time && override.end_time! > window.start_time);
  }

  function validateOverrides(items: AvailabilityOverride[]) {
    for (const override of items) {
      if (!override.day) return "Alege data pentru fiecare excepție.";
      if (isPastDay(override.day)) return `Excepția din ${formatDisplayDate(override.day)} este în trecut. Poți seta excepții doar pentru azi sau pentru zile viitoare.`;
      if (override.is_unavailable) continue;
      if (!isValidTime(override.start_time) || !isValidTime(override.end_time)) {
        return `Excepția din ${formatDisplayDate(override.day)} trebuie să folosească ore în format 24h: HH:mm.`;
      }
      if (!override.start_time || !override.end_time || override.start_time >= override.end_time) {
        return `Intervalul excepției din ${formatDisplayDate(override.day)} trebuie să aibă ora de început mai mică decât ora de final.`;
      }
      if (!overrideOverlapsAvailability(override)) {
        return `Excepția din ${formatDisplayDate(override.day)} trebuie să se suprapună cu cel puțin un interval de disponibilitate al zilei.`;
      }
    }
    return null;
  }

  function validateOverrideDuplicates(items: AvailabilityOverride[]) {
    const byDay = new Map<string, AvailabilityOverride[]>();
    items.forEach((override) => {
      byDay.set(override.day, [...(byDay.get(override.day) ?? []), override]);
    });
    for (const [day, dayItems] of byDay.entries()) {
      const unavailableCount = dayItems.filter((override) => override.is_unavailable).length;
      const displayDay = formatDisplayDate(day);
      if (unavailableCount > 1) return `Există deja o excepție de indisponibilitate pentru ${displayDay}.`;
      if (unavailableCount && dayItems.length > 1) return `Data de ${displayDay} este marcată ca indisponibilă, deci nu poate avea și intervale parțiale.`;

      const ranges = dayItems
        .filter((override) => !override.is_unavailable)
        .map((override) => ({ start: override.start_time ?? "", end: override.end_time ?? "" }))
        .sort((a, b) => a.start.localeCompare(b.start));
      const signatures = new Set(ranges.map((range) => `${range.start}-${range.end}`));
      if (signatures.size !== ranges.length) return `Există deja o excepție cu același interval pentru ${displayDay}.`;
      for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index].start < ranges[index - 1].end) {
          return `Excepțiile din ${displayDay} nu se pot suprapune.`;
        }
      }
    }
    return null;
  }

  async function save() {
    const validationError = validateWindows(windows);
    if (validationError) {
      showValidationError(validationError);
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

    setSavingWindows(true);
    setError(null);
    setSuccess(null);

    try {
      await api.put("/users/me/availability-windows", payload);
      setSuccess("Disponibilitatea a fost salvată.");
      await load();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut salva disponibilitatea"));
    } finally {
      setSavingWindows(false);
    }
  }

  function addOverride() {
    setOverrides((current) => [
      ...current,
      {
        draft_id: createDraftId(),
        day: localDateInputValue(),
        is_unavailable: true,
        start_time: "09:00",
        end_time: "17:00",
      },
    ]);
    scrollOverridesToBottom();
  }

  function updateOverrideById(draftId: string | undefined, patch: Partial<AvailabilityOverride>) {
    if (!draftId) return;
    setOverrides((current) => current.map((item) => (item.draft_id === draftId ? { ...item, ...patch } : item)));
  }

  async function changeOverrideDay(draftId: string | undefined, day: string) {
    if (!draftId) return;
    const target = overrides.find((item) => item.draft_id === draftId);
    if (!target) return;

    if (target.is_unavailable && day) {
      const partialsForDay = overrides.filter((item) => item.draft_id !== draftId && item.day === day && !item.is_unavailable);
      if (partialsForDay.length > 0) {
        const confirmed = await confirm({
          title: "Marcare zi indisponibilă",
          description: `Pentru ${formatDisplayDate(day)} există deja excepții pe intervale. Vrei să marchezi întreaga zi ca indisponibilă? Excepțiile parțiale pentru această zi vor fi eliminate.`,
          confirmLabel: "Da, marchează ziua",
          cancelLabel: "Nu, păstrează intervalele",
          tone: "warning",
        });
        if (!confirmed) return;
      }
    }

    setOverrides((current) =>
      current.flatMap((item) => {
        if (item.draft_id === draftId) return [{ ...item, day }];
        if (target.is_unavailable && day && item.day === day) return [];
        return [item];
      })
    );
  }

  async function setOverrideUnavailable(draftId: string | undefined, checked: boolean) {
    if (!draftId) return;
    const target = overrides.find((item) => item.draft_id === draftId);
    if (!target) return;

    if (checked && target.day) {
      const partialsForDay = overrides.filter((item) => item.draft_id !== draftId && item.day === target.day && !item.is_unavailable);
      if (partialsForDay.length > 0) {
        const confirmed = await confirm({
          title: "Marcare zi indisponibilă",
          description: `Pentru ${formatDisplayDate(target.day)} există deja excepții pe intervale. Vrei să marchezi întreaga zi ca indisponibilă? Excepțiile parțiale pentru această zi vor fi eliminate.`,
          confirmLabel: "Da, marchează ziua",
          cancelLabel: "Nu, păstrează intervalele",
          tone: "warning",
        });
        if (!confirmed) return;
      }
    }

    setOverrides((current) => {
      const currentTarget = current.find((item) => item.draft_id === draftId);
      if (!currentTarget) return current;
      const updated = {
        ...currentTarget,
        is_unavailable: checked,
        start_time: checked ? currentTarget.start_time : currentTarget.start_time ?? "09:00",
        end_time: checked ? currentTarget.end_time : currentTarget.end_time ?? "17:00",
      };

      if (!checked || !currentTarget.day) {
        return current.map((item) => (item.draft_id === draftId ? updated : item));
      }

      return current.flatMap((item) => {
        if (item.draft_id === draftId) return [updated];
        if (item.day === currentTarget.day) return [];
        return [item];
      });
    });
  }

  async function removeOverride(index: number) {
    const confirmed = await confirm({
      title: "Ștergere excepție",
      description: "Sigur vrei să ștergi această excepție de disponibilitate?",
      confirmLabel: "Șterge excepția",
    });
    if (!confirmed) return;
    setOverrides((current) => current.filter((_, itemIndex) => itemIndex !== index));
    scrollOverridesToTop();
  }

  async function saveOverrides() {
    setSavingOverrides(true);
    setError(null);
    setSuccess(null);

    const validationError = validateOverrides(overrides) || validateOverrideDuplicates(overrides);
    if (validationError) {
      setSavingOverrides(false);
      showValidationError(validationError);
      return;
    }

    const payload = {
      overrides: sortOverrides(overrides).map((override) => ({
        day: override.day,
        is_unavailable: override.is_unavailable,
        start_time: override.is_unavailable ? null : override.start_time,
        end_time: override.is_unavailable ? null : override.end_time,
      })),
    };

    try {
      await api.put("/users/me/availability-overrides", payload);
      setSuccess("Exceptiile au fost salvate.");
      await loadOverrides();
      scrollOverridesToTop();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut salva excepțiile"));
    } finally {
      setSavingOverrides(false);
    }
  }

  return (
    <AppLayout title="Disponibilitate" eyebrow="Planificare personală">
      <Stack spacing={2.5}>
        {loading ? <LinearProgress /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}
        <Dialog open={Boolean(errorDialog)} onClose={() => setErrorDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Date invalide</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: "text.secondary" }}>
              {errorDialog}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "center", pb: 2.5 }}>
            <Button variant="contained" onClick={() => setErrorDialog(null)}>
              OK
            </Button>
          </DialogActions>
        </Dialog>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2.5, alignItems: "start" }}>
          <Card sx={{ height: { md: "calc(100vh - 190px)" }, minHeight: { md: 560 } }}>
            <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
                <AccessTimeRoundedIcon sx={{ color: "primary.main" }} />
                <Typography variant="h6">Program săptămânal</Typography>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
                <Button variant="outlined" startIcon={<RestoreRoundedIcon />} onClick={applyStandardWorkWeek}>
                  Program standard 09:00-17:00
                </Button>
              </Stack>

              <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
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
                          Adaugă interval
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
                          <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Adaugă cel puțin un interval pentru această zi.</Typography>
                        ) : null}
                        <Box ref={(node: HTMLDivElement | null) => { windowEndRefs.current[day.value] = node; }} sx={{ height: 1 }} />
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexShrink: 0, justifyContent: "flex-end" }}>
                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={save} disabled={savingWindows}>
                  {savingWindows ? "Se salvează..." : "Salvează"}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ height: { md: "calc(100vh - 190px)" }, minHeight: { md: 560 } }}>
            <CardContent sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
                <EventBusyRoundedIcon sx={{ color: "error.main" }} />
                <Typography variant="h6">Excepții</Typography>
              </Stack>

              <Stack ref={overridesListRef} spacing={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5, alignItems: "stretch", justifyContent: "flex-start" }}>
                {overrides.map((override) => (
                  <Box
                    key={override.draft_id ?? `${override.day}-${override.start_time}-${override.end_time}`}
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
                        <DatePicker
                          label="Zi"
                          value={override.day ? dayjs(override.day) : null}
                          onChange={(value) => void changeOverrideDay(override.draft_id, value?.format("YYYY-MM-DD") ?? "")}
                          minDate={dayjs(localDateInputValue())}
                          format="DD.MM.YYYY"
                          slotProps={{
                            textField: {
                              error: Boolean(override.day) && isPastDay(override.day),
                              helperText: Boolean(override.day) && isPastDay(override.day) ? "Alege o dată de azi sau din viitor." : " ",
                              sx: { minWidth: { lg: 210 } },
                            },
                          }}
                        />

                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "space-between", lg: "flex-end" } }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={override.is_unavailable}
                                onChange={(event) => void setOverrideUnavailable(override.draft_id, event.target.checked)}
                              />
                            }
                            label={<Typography sx={{ fontWeight: 800 }}>Zi indisponibila</Typography>}
                            labelPlacement="start"
                            sx={{ m: 0 }}
                          />
                          <IconButton color="error" onClick={() => removeOverride(overrides.findIndex((item) => item.draft_id === override.draft_id))} aria-label="Sterge exceptia">
                            <DeleteOutlineRoundedIcon />
                          </IconButton>
                        </Stack>
                      </Stack>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
                        <TextField
                          label="De la"
                          value={override.start_time ?? "09:00"}
                          disabled={override.is_unavailable}
                          onChange={(event) => updateOverrideById(override.draft_id, { start_time: event.target.value })}
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
                          onChange={(event) => updateOverrideById(override.draft_id, { end_time: event.target.value })}
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

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexShrink: 0, justifyContent: "space-between", alignItems: "center" }}>
                <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addOverride}>
                  Adaugă excepție
                </Button>
                <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveOverrides} disabled={savingOverrides}>
                  Salvează
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
      {confirmDialog}
    </AppLayout>
  );
}
