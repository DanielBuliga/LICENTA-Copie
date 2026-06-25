import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import dayjs from "dayjs";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";

type ProjectInfo = { id: number; title: string };

function sanitizeFilePart(text: string) {
  return text.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "proiect";
}

export function ExportTab({ projectId }: { projectId: number }) {
  const [projectTitle, setProjectTitle] = useState(`proiect_${projectId}`);
  const [startDay, setStartDay] = useState(dayjs().format("YYYY-MM-DD"));
  const [daysInput, setDaysInput] = useState("14");
  const [error, setError] = useState<string | null>(null);

  async function downloadIcs() {
    const from = dayjs(startDay).startOf("day");
    const days = Number(daysInput);
    setError(null);

    if (from.isBefore(dayjs(), "day")) {
      setError("Data de start trebuie să fie azi sau în viitor.");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      setError("Numărul de zile trebuie să fie între 1 și 60.");
      return;
    }

    try {
      const res = await api.get(`/projects/${projectId}/plan/export-ics`, {
        params: { from: from.toISOString(), to: from.add(days, "day").toISOString() },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeFilePart(projectTitle)}_plan_${dayjs().format("YYYYMMDD_HHmm")}.ics`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut exporta planul"));
    }
  }

  useEffect(() => {
    api.get<ProjectInfo>(`/projects/${projectId}`)
      .then((res) => setProjectTitle(res.data.title))
      .catch(() => setProjectTitle(`proiect_${projectId}`));
  }, [projectId]);

  function updateDaysInput(value: string) {
    const digitsOnly = value.replace(/\D/g, "");
    setDaysInput(digitsOnly.replace(/^0+(?=\d)/, ""));
  }

  const hasPastStart = dayjs(startDay).isBefore(dayjs(), "day");
  const days = Number(daysInput);
  const hasInvalidDays = !Number.isInteger(days) || days < 1 || days > 60;

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Exportă calendarul proiectului
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            Descarcă planul activ al proiectului în format ICS pentru import în Google Calendar sau alte calendare.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", sm: "flex-start" } }}>
            <TextField
              label="Start"
              type="date"
              value={startDay}
              onChange={(event) => setStartDay(event.target.value)}
              error={hasPastStart}
              helperText={hasPastStart ? "Alege o dată de azi sau din viitor." : " "}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dayjs().format("YYYY-MM-DD") } }}
              sx={{ minWidth: 180 }}
            />
            <TextField
              label="Zile"
              value={daysInput}
              onChange={(event) => updateDaysInput(event.target.value)}
              error={hasInvalidDays}
              helperText="1-60 zile"
              slotProps={{ htmlInput: { inputMode: "numeric", pattern: "[0-9]*" } }}
              sx={{ width: { xs: "100%", sm: 130 } }}
            />
            <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={downloadIcs} disabled={hasPastStart || hasInvalidDays}>
              Descarcă 
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
