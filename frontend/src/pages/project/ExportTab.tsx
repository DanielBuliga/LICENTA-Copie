import { useState } from "react";
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import dayjs from "dayjs";
import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";

export function ExportTab({ projectId }: { projectId: number }) {
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
      link.download = `project_${projectId}_plan.ics`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut exporta planul"));
    }
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Export calendar
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            Descarca planul in format ICS pentru import in Google Calendar sau alte calendare.
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
              label="Numar zile"
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
              Descarca ICS
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
