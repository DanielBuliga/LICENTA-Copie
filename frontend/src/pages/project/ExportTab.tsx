import { useEffect, useState } from "react";
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
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
  const [days, setDays] = useState(14);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadIcs() {
    const from = dayjs(startDay).startOf("day");
    setError(null);
    try {
      const res = await api.get(`/projects/${projectId}/plan/export-ics`, {
        params: { from: from.toISOString(), to: from.add(days, "day").toISOString(), include_completed: includeCompleted },
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

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Exportă calendarul proiectului
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            Descarcă planul proiectului în format ICS pentru import în Google Calendar sau alte calendare.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Start"
              type="date"
              value={startDay}
              onChange={(event) => setStartDay(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Număr zile"
              type="number"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 1, max: 60 } }}
            />
            <FormControlLabel
              control={<Checkbox checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />}
              label="Include taskuri finalizate"
              sx={{ alignSelf: "center" }}
            />
            <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={downloadIcs}>
              Descarcă ICS
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
