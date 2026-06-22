import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Divider, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import dayjs from "dayjs";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import type { ProjectListItem } from "../api/types";
import { AppLayout } from "../components/AppLayout";
import { useAccentColor } from "../hooks/useAccentColor";
import { ChatMessageList, type ChatMessageItem } from "./project/ChatMessageList";

type MessageItem = ChatMessageItem;
type CurrentUser = { id: number };
type NotificationItem = {
  id: number;
  type: string;
  project_id: number | null;
  is_read: boolean;
};

function mergeMessages(current: MessageItem[], incoming: MessageItem[]) {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
}

function asLocalTime(value: string) {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return dayjs(hasTimezone ? value : `${value}Z`);
}

export function MessagingPage() {
  const accent = useAccentColor();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const lastId = useMemo(() => messages.at(-1)?.id ?? 0, [messages]);

  const loadProjects = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await api.get<ProjectListItem[]>("/projects");
      setProjects(res.data);
      const requestedProjectId = Number(searchParams.get("projectId"));
      const projectFromUrl = res.data.find((project) => project.id === requestedProjectId)?.id ?? null;
      setSelectedProjectId((current) => projectFromUrl ?? current ?? res.data[0]?.id ?? null);
      const meRes = await api.get<CurrentUser>("/users/me");
      setCurrentUserId(meRes.data.id);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca proiectele pentru mesagerie"));
    } finally { setLoading(false); }
  }, [searchParams]);

  const loadMessages = useCallback(async (projectId: number, append = false) => {
    try {
      const res = await api.get<MessageItem[]>(`/projects/${projectId}/messages`, { params: append && lastId ? { after_id: lastId } : undefined });
      setMessages((current) => append ? mergeMessages(current, res.data) : res.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca mesajele"));
    }
  }, [lastId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { if (!selectedProjectId) { setMessages([]); return; } void loadMessages(selectedProjectId, false); }, [loadMessages, selectedProjectId]);
  useEffect(() => { if (!selectedProjectId) return; const id = window.setInterval(() => void loadMessages(selectedProjectId, true), 3000); return () => window.clearInterval(id); }, [loadMessages, selectedProjectId]);
  useEffect(() => {
    if (!selectedProjectId) return;
    if (searchParams.get("projectId") !== String(selectedProjectId)) {
      setSearchParams({ projectId: String(selectedProjectId) }, { replace: true });
    }
  }, [searchParams, selectedProjectId, setSearchParams]);
  useEffect(() => {
    async function markProjectMessagesRead(projectId: number) {
      try {
        const res = await api.get<NotificationItem[]>("/notifications", { params: { unread_only: true } });
        const messageNotifications = res.data.filter(
          (notification) =>
            notification.type === "PROJECT_MESSAGE" &&
            notification.project_id === projectId &&
            !notification.is_read
        );
        if (!messageNotifications.length) return;
        await Promise.all(messageNotifications.map((notification) => api.patch(`/notifications/${notification.id}/read`)));
        window.dispatchEvent(new Event("smartplanner:notifications-refresh"));
      } catch {
        // Mesageria trebuie să rămână utilizabilă chiar dacă notificările nu pot fi actualizate.
      }
    }
    if (selectedProjectId) void markProjectMessagesRead(selectedProjectId);
  }, [selectedProjectId]);

  async function send() {
    if (!selectedProjectId || !content.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await api.post<MessageItem>(`/projects/${selectedProjectId}/messages`, { content: content.trim() });
      setMessages((current) => mergeMessages(current, [res.data]));
      setContent("");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut trimite mesajul"));
    } finally { setLoading(false); }
  }

  return (
    <AppLayout title="Mesagerie">
      <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", height: { xs: "calc(100vh - 150px)", md: "calc(100vh - 170px)" }, minHeight: 560 }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ height: "100%", minHeight: 0 }}>
          <Box sx={{ width: { xs: "100%", md: 320 }, borderRight: { md: "1px solid" }, borderBottom: { xs: "1px solid", md: 0 }, borderColor: "divider" }}>
            <Box sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                <ChatBubbleOutlineRoundedIcon color="primary" sx={{ mt: 0.45 }} />
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.15 }}>Mesagerie</Typography>
                  <Typography sx={{ color: "text.secondary", fontSize: 14, mt: 0.25 }}>Chat pe proiecte</Typography>
                </Box>
              </Stack>
            </Box>
            <Divider />
            {loading && projects.length === 0 ? <LinearProgress /> : null}
            <Stack sx={{ p: 1.25, maxHeight: { xs: 220, md: "none" }, flex: { md: 1 }, overflow: "auto" }}>
              {projects.map((project) => {
                const selected = project.id === selectedProjectId;
                return (
                  <Button key={project.id} onClick={() => setSelectedProjectId(project.id)} fullWidth sx={{ justifyContent: "flex-start", textAlign: "left", borderRadius: 2, px: 1.5, py: 1.25, mb: 0.5, bgcolor: selected ? accent.soft : "transparent", color: "text.primary", textTransform: "none", "&:hover": { bgcolor: selected ? accent.soft : "action.hover" } }}>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start", width: "100%" }}><FolderOutlinedIcon sx={{ color: selected ? accent.text : "text.secondary", mt: 0.15 }} /><Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ fontWeight: 900 }}>{project.title}</Typography><Typography noWrap sx={{ color: "text.secondary", fontSize: 13 }}>{selected && messages.at(-1) ? `Ultimul mesaj: ${asLocalTime(messages.at(-1)!.created_at).format("DD MMM, HH:mm")}` : "Chat pe proiect"}</Typography></Box></Stack>
                  </Button>
                );
              })}
              {projects.length === 0 && !loading ? <Typography sx={{ color: "text.secondary", p: 2 }}>Nu esti membru in niciun proiect.</Typography> : null}
            </Stack>
          </Box>

          <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <Box sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              {selectedProject ? <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}><FolderOutlinedIcon color="primary" /><Typography variant="h6" sx={{ flex: 1 }}>{selectedProject.title}</Typography><Chip size="small" label={selectedProject.role} color={selectedProject.role === "OWNER" ? "primary" : "default"} sx={{ fontWeight: 900 }} /></Stack> : <Typography variant="h6">Selecteaza un proiect</Typography>}
            </Box>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Stack sx={{ flex: 1, minHeight: 0, p: 3, bgcolor: "background.default" }}>
              {selectedProject ? <ChatMessageList messages={messages} currentUserId={currentUserId} /> : null}
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}><TextField value={content} onChange={(event) => setContent(event.target.value)} placeholder="Scrie un mesaj..." fullWidth disabled={!selectedProjectId} /><Button variant="contained" endIcon={<SendRoundedIcon />} onClick={send} disabled={loading || !content.trim() || !selectedProjectId}>Trimite</Button></Stack>
          </Stack>
        </Stack>
      </Box>
    </AppLayout>
  );
}
