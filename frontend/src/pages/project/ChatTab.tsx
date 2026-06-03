import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

import { api } from "../../api/api";
import { getApiErrorMessage } from "../../api/errors";
import { ChatMessageList, type ChatMessageItem } from "./ChatMessageList";

type MessageItem = ChatMessageItem;
type CurrentUser = { id: number };

function mergeMessages(current: MessageItem[], incoming: MessageItem[]) {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !seen.has(message.id))];
}

export function ChatTab({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lastId = useMemo(() => messages.at(-1)?.id ?? 0, [messages]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<MessageItem[]>(`/projects/${projectId}/messages`, {
        params: lastId ? { after_id: lastId } : undefined,
      });
      if (res.data.length) {
        setMessages((current) => mergeMessages(current, res.data));
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut încărca mesajele"));
    }
  }, [lastId, projectId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    api.get<CurrentUser>("/users/me").then((res) => setCurrentUserId(res.data.id)).catch(() => setCurrentUserId(null));
  }, []);

  async function send() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<MessageItem>(`/projects/${projectId}/messages`, { content: content.trim() });
      setMessages((current) => mergeMessages(current, [res.data]));
      setContent("");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Nu am putut trimite mesajul"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        <Stack sx={{ height: { xs: 560, md: "calc(100vh - 260px)" }, minHeight: 520 }}>
          <Box sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="h6">Chat proiect</Typography>
            <Typography sx={{ color: "text.secondary" }}>Mesaje vizibile tuturor membrilor proiectului.</Typography>
          </Box>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Stack sx={{ flex: 1, minHeight: 0, p: 3, bgcolor: "background.default" }}>
            <ChatMessageList messages={messages} currentUserId={currentUserId} />
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
            <TextField value={content} onChange={(event) => setContent(event.target.value)} placeholder="Scrie un mesaj..." fullWidth />
            <Button variant="contained" endIcon={<SendRoundedIcon />} onClick={send} disabled={loading || !content.trim()}>
              Trimite
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
