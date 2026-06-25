import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import dayjs from "dayjs";
import "dayjs/locale/ro";

import { useAccentColor } from "../../hooks/useAccentColor";

export type ChatMessageItem = {
  id: number;
  project_id: number;
  sender_id: number;
  sender_name?: string | null;
  sender_email?: string | null;
  content: string;
  created_at: string;
};

function senderName(message: ChatMessageItem) {
  return message.sender_name || message.sender_email || `User #${message.sender_id}`;
}

function asLocalTime(value: string) {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return dayjs(hasTimezone ? value : `${value}Z`);
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRoDate(value: dayjs.Dayjs, format: string) {
  return capitalizeFirst(value.locale("ro").format(format));
}

export function ChatMessageList({ messages, currentUserId }: { messages: ChatMessageItem[]; currentUserId?: number | null }) {
  const accent = useAccentColor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);
  const previousLastIdRef = useRef<number | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);

  function isNearBottom(element: HTMLDivElement) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowNewMessages(false);
    wasNearBottomRef.current = true;
  }

  function handleScroll() {
    const element = containerRef.current;
    if (!element) return;
    const nearBottom = isNearBottom(element);
    wasNearBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessages(false);
  }

  useEffect(() => {
    const lastId = messages.at(-1)?.id ?? null;
    const previousLastId = previousLastIdRef.current;
    previousLastIdRef.current = lastId;

    if (!lastId) return;
    if (previousLastId === null) {
      window.requestAnimationFrame(() => scrollToBottom("auto"));
      return;
    }
    if (lastId === previousLastId) return;

    const lastMessage = messages.at(-1);
    const mine = currentUserId === lastMessage?.sender_id;
    if (wasNearBottomRef.current || mine) {
      window.requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      setShowNewMessages(true);
    }
  }, [currentUserId, messages]);

  if (messages.length === 0) {
    return (
      <Stack sx={{ flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
        <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 56, opacity: 0.35 }} />
        <Typography>Niciun mesaj. Fii primul!</Typography>
      </Stack>
    );
  }

  return (
    <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
      <Stack ref={containerRef} onScroll={handleScroll} spacing={1.25} sx={{ position: "absolute", inset: 0, overflowY: "auto", pr: 0.5 }}>
        {messages.map((message, index) => {
          const name = senderName(message);
          const createdAt = asLocalTime(message.created_at);
          const day = formatRoDate(createdAt, "DD MMM YYYY");
          const previousDay = index > 0 ? formatRoDate(asLocalTime(messages[index - 1].created_at), "DD MMM YYYY") : "";
          const showDay = day !== previousDay;
          const mine = currentUserId === message.sender_id;

          return (
            <Stack key={message.id} spacing={1}>
              {showDay ? (
                <Chip
                  size="small"
                  label={day}
                  sx={{
                    alignSelf: "center",
                    fontWeight: 900,
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              ) : null}
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start" }}>
                {!mine ? (
                  <Avatar sx={{ width: 34, height: 34, bgcolor: accent.soft, color: accent.text, fontWeight: 900 }}>
                    {name.slice(0, 1).toUpperCase()}
                  </Avatar>
                ) : null}
                <Box
                  sx={{
                    maxWidth: { xs: "88%", md: "70%" },
                    bgcolor: mine ? accent.value : "background.paper",
                    color: mine ? "#fff" : "text.primary",
                    border: "1px solid",
                    borderColor: mine ? alpha(accent.value, 0.45) : "divider",
                    borderRadius: 2.25,
                    px: 1.5,
                    py: 1,
                    boxShadow: mine ? `0 10px 24px ${alpha(accent.value, 0.22)}` : "none",
                  }}
                >
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 2 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: 13, color: mine ? "rgba(255,255,255,0.92)" : "text.primary" }}>
                      {mine ? "Tu" : name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: mine ? "rgba(255,255,255,0.72)" : "text.secondary", flexShrink: 0 }}>
                      {createdAt.format("HH:mm")}
                    </Typography>
                  </Stack>
                  <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", mt: 0.25 }}>{message.content}</Typography>
                </Box>
              </Stack>
            </Stack>
          );
        })}
        <Box ref={endRef} sx={{ height: 1 }} />
      </Stack>
      {showNewMessages ? (
        <Button
          size="small"
          variant="contained"
          onClick={() => scrollToBottom()}
          sx={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", boxShadow: `0 12px 28px ${alpha(accent.value, 0.35)}` }}
        >
          Mesaje noi
        </Button>
      ) : null}
    </Box>
  );
}
