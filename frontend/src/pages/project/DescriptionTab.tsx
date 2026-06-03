import { useCallback, useEffect, useState } from "react";
import { Alert, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { ProjectDocumentsList, type ProjectDocument } from "./DocumentsTab";
import { openProjectDocument } from "./documentUtils";

export function DescriptionTab({ projectId, description }: { projectId: number; description: string | null }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ProjectDocument[]>(`/projects/${projectId}/documents`);
      setDocuments(res.data.filter((doc) => doc.task_id === null));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca documentele proiectului"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Descriere proiect
          </Typography>
          <Typography sx={{ color: "text.secondary", whiteSpace: "pre-wrap" }}>
            {description?.trim() || "Nu există descriere pentru acest proiect."}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Documente atasate proiectului
          </Typography>
          {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
          {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
          <ProjectDocumentsList documents={documents} onOpen={(doc) => void openProjectDocument(doc, setError)} />
        </CardContent>
      </Card>
    </Stack>
  );
}
