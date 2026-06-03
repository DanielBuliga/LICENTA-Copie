import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../api/api";
import { clearToken, getToken } from "../api/auth";

type Props = {
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
};

type CurrentUser = {
  id: number;
  email: string;
  name?: string | null;
};

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  project_id: number | null;
  task_id: number | null;
  is_read: boolean;
  created_at: string;
};

const drawerWidth = 264;
const headerHeight = 82;
const accent = "#7E879F";
const accentHover = "#6D7988";
const accentSoft = "#E9ECF3";

const navItems = [
  { label: "Tablou de bord", path: "/dashboard", icon: <DashboardRoundedIcon /> },
  { label: "Proiecte", path: "/projects", icon: <FolderRoundedIcon /> },
  { label: "Activități", path: "/activities", icon: <FormatListBulletedRoundedIcon /> },
  { label: "Calendar", path: "/calendar", icon: <CalendarMonthRoundedIcon /> },
  { label: "Disponibilitate", path: "/availability", icon: <EventAvailableRoundedIcon /> },
  { label: "Competențe", path: "/skills", icon: <PsychologyRoundedIcon /> },
  { label: "Mesaje", path: "/messages", icon: <MailOutlineRoundedIcon /> },
];

let cachedUserToken: string | null = null;
let cachedCurrentUser: CurrentUser | null = null;

export function AppLayout({ title, children }: Props) {
  const nav = useNavigate();
  const location = useLocation();
  const token = getToken();
  const [user, setUser] = useState<CurrentUser | null>(() => (cachedUserToken === token ? cachedCurrentUser : null));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const loadUser = useCallback(async () => {
    if (!token) return;
    if (cachedUserToken === token && cachedCurrentUser) {
      setUser(cachedCurrentUser);
      return;
    }

    try {
      const res = await api.get<CurrentUser>("/users/me");
      cachedUserToken = token;
      cachedCurrentUser = res.data;
      setUser(res.data);
    } catch {
      cachedUserToken = null;
      cachedCurrentUser = null;
      setUser(null);
    }
  }, [token]);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<NotificationItem[]>("/notifications");
      setNotifications(res.data);
    } catch {
      setNotifications([]);
    }
  }, [token]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  function onLogout() {
    cachedUserToken = null;
    cachedCurrentUser = null;
    clearToken();
    nav("/login");
  }

  async function markAllNotificationsRead() {
    try {
      await api.post("/notifications/mark-all-read");
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
    } catch {
      void loadNotifications();
    }
  }

  async function openNotification(notification: NotificationItem) {
    if (!notification.is_read) {
      try {
        await api.patch(`/notifications/${notification.id}/read`);
        setNotifications((current) =>
          current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
        );
      } catch {
        void loadNotifications();
      }
    }

    setNotificationsAnchor(null);
    if (notification.task_id) {
      nav(`/activities/${notification.task_id}`);
      return;
    }
    if (notification.project_id) {
      nav(`/projects/${notification.project_id}`);
    }
  }

  const displayName = user?.name?.trim() || user?.email || "Cont conectat";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const drawer = (
    <Stack sx={{ height: "100%", bgcolor: "#FFFFFF", color: "#111827" }}>
      <Box
        sx={{
          height: headerHeight,
          px: 3,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid rgba(17,24,39,0.08)",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              bgcolor: accent,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 12px 28px rgba(76, 92, 104, 0.20)",
            }}
          >
            <EventAvailableRoundedIcon />
          </Box>
          <Typography sx={{ fontWeight: 900, lineHeight: 1.1, fontSize: 20 }}>Smart Planner</Typography>
        </Stack>
      </Box>

      <List sx={{ px: 1.5, py: 2.5, flex: 1 }}>
        {navItems.map((item) => {
          const selected =
            location.pathname === item.path ||
            (item.path === "/projects" && location.pathname.startsWith("/projects/"));

          return (
            <ListItemButton
              key={item.path}
              component={RouterLink}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              selected={selected}
              sx={{
                borderRadius: 2,
                mb: 0.75,
                minHeight: 50,
                color: selected ? "#fff" : "#5B6680",
                "&.Mui-selected": {
                  bgcolor: accent,
                  boxShadow: "0 10px 26px rgba(76,92,104,0.20)",
                  "&:hover": { bgcolor: accentHover },
                },
                "&:hover": { bgcolor: "rgba(17,24,39,0.04)" },
              }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 42 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontWeight: 800 }}>{item.label}</Typography>} />
            </ListItemButton>
          );
        })}
      </List>

      {token ? (
        <Box sx={{ borderTop: "1px solid rgba(17,24,39,0.08)", p: 2 }}>
          <Button
            fullWidth
            component={RouterLink}
            to="/account"
            sx={{
              justifyContent: "flex-start",
              color: "#111827",
              bgcolor: "#F8FAFC",
              border: "1px solid rgba(17,24,39,0.08)",
              borderRadius: 2,
              mb: 1.25,
              px: 1.25,
              py: 0.9,
              "&:hover": { bgcolor: "#F1F5F9" },
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", width: "100%", minWidth: 0 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: accentSoft, color: "#30384C", fontWeight: 900 }}>
                {initials || <AccountCircleRoundedIcon />}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: 14 }}>
                  {displayName}
                </Typography>
                <Typography noWrap sx={{ color: "text.secondary", fontSize: 12 }}>
                  {user?.email ?? "Profil utilizator"}
                </Typography>
              </Box>
            </Stack>
          </Button>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<LogoutRoundedIcon />}
            onClick={onLogout}
            sx={{
              color: "#5B6680",
              borderColor: "rgba(17,24,39,0.12)",
              "&:hover": { borderColor: "rgba(17,24,39,0.24)", bgcolor: "rgba(17,24,39,0.04)" },
            }}
          >
            Deconectare
          </Button>
        </Box>
      ) : null}
    </Stack>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#F4F6FA", display: "flex" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            border: 0,
            borderRight: "1px solid rgba(17,24,39,0.08)",
          },
        }}
      >
        {drawer}
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            border: 0,
          },
        }}
      >
        {drawer}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            height: headerHeight,
            px: { xs: 2, md: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            bgcolor: "rgba(255,255,255,0.86)",
            borderBottom: "1px solid rgba(17, 24, 39, 0.08)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            backdropFilter: "blur(12px)",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
              <IconButton
                onClick={() => setMobileOpen(true)}
                aria-label="Deschide meniul"
                sx={{
                  display: { xs: "inline-flex", md: "none" },
                  bgcolor: "#FFFFFF",
                  border: "1px solid rgba(17,24,39,0.08)",
                  flexShrink: 0,
                }}
              >
                <MenuRoundedIcon />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                {typeof title === "string" || title === undefined ? (
                  <Typography variant="h4" noWrap>{title ?? "Smart Planner"}</Typography>
                ) : (
                  title
                )}
              </Box>
            </Stack>
          </Box>

          {token ? (
            <IconButton
              onClick={(event) => setNotificationsAnchor(event.currentTarget)}
              aria-label="Notificări"
              sx={{
                width: 44,
                height: 44,
                bgcolor: "#FFFFFF",
                border: "1px solid rgba(17,24,39,0.08)",
                boxShadow: "0 8px 22px rgba(15,23,42,0.06)",
                "&:hover": { bgcolor: "#F8FAFC" },
              }}
            >
              <Badge badgeContent={unreadCount} color="error" max={99}>
                <NotificationsNoneRoundedIcon />
              </Badge>
            </IconButton>
          ) : null}
        </Box>

        <Popover
          anchorEl={notificationsAnchor}
          open={Boolean(notificationsAnchor)}
          onClose={() => setNotificationsAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              sx: {
                width: 380,
                maxWidth: "calc(100vw - 24px)",
                mt: 1,
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid rgba(17,24,39,0.08)",
              },
            },
          }}
        >
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 950 }}>Notificări</Typography>
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                {unreadCount ? `${unreadCount} necitite` : "Toate sunt citite"}
              </Typography>
            </Box>
            <Button
              size="small"
              startIcon={<DoneAllRoundedIcon />}
              onClick={markAllNotificationsRead}
              disabled={!unreadCount}
              sx={{ fontWeight: 800 }}
            >
              Marchează citite
            </Button>
          </Stack>
          <Divider />
          <Stack sx={{ maxHeight: 420, overflowY: "auto" }}>
            {notifications.length ? (
              notifications.map((notification) => (
                <Button
                  key={notification.id}
                  onClick={() => void openNotification(notification)}
                  sx={{
                    display: "block",
                    textAlign: "left",
                    color: "text.primary",
                    borderRadius: 0,
                    px: 2,
                    py: 1.5,
                    bgcolor: notification.is_read ? "#FFFFFF" : "#F3F6FF",
                    borderBottom: "1px solid rgba(17,24,39,0.06)",
                    "&:hover": { bgcolor: notification.is_read ? "#F8FAFC" : "#EEF2FF" },
                  }}
                >
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                    <Box
                      sx={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        bgcolor: notification.is_read ? "transparent" : accent,
                        mt: 0.75,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 900, fontSize: 14 }}>{notification.title}</Typography>
                      <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.25 }}>
                        {notification.body}
                      </Typography>
                      <Typography sx={{ color: "text.disabled", fontSize: 12, mt: 0.75 }}>
                        {dayjs(notification.created_at).format("DD MMM YYYY, HH:mm")}
                      </Typography>
                    </Box>
                  </Stack>
                </Button>
              ))
            ) : (
              <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>
                Nu ai notificări momentan.
              </Typography>
            )}
          </Stack>
        </Popover>

        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1320 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
