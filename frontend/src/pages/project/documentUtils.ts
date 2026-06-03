import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import type { ProjectDocument } from "./DocumentsTab";

export async function openProjectDocument(doc: ProjectDocument, onError?: (message: string) => void) {
  if (!doc.file_url) return;
  try {
    const response = await api.get<Blob>(doc.file_url, { responseType: "blob" });
    const blobUrl = window.URL.createObjectURL(response.data);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err: unknown) {
    onError?.(getApiErrorMessage(err, "Nu am putut deschide documentul"));
  }
}
