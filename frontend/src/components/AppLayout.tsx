import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
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
  useTheme,
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
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/api";
import { clearToken, getToken } from "../api/auth";
import { apiDate, formatApiDatesInText } from "../utils/dateTime";

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

type UnreadCount = {
  unread: number;
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
  { label: "Mesagerie", path: "/messages", icon: <MailOutlineRoundedIcon /> },
];

const planAttentionNotificationTypes = new Set([
  "PLAN_PROBLEMS",
  "PLAN_IMPACT",
  "MEMBER_INACTIVE_REPLAN",
  "MISSED_PLANNED_WORK",
  "TASK_CHANGED",
  "TASK_DELETED",
  "TASK_UNASSIGNED",
]);

function needsPlanAttention(notification: NotificationItem) {
  return planAttentionNotificationTypes.has(notification.type);
}

function opensProjectPlan(notification: NotificationItem) {
  return needsPlanAttention(notification) || notification.type === "TASK_REPLANNED";
}

let cachedUserToken: string | null = null;
let cachedCurrentUser: CurrentUser | null = null;
const NOTIFICATIONS_PAGE_SIZE = 50;

export function AppLayout({ title, children }: Props) {
  const nav = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const token = getToken();
  const isDark = theme.palette.mode === "dark";
  const [user, setUser] = useState<CurrentUser | null>(() => (cachedUserToken === token ? cachedCurrentUser : null));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRefreshTimer = useRef<number | null>(null);
  const notificationsCountRef = useRef(0);

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

  const loadNotifications = useCallback(async (append = false) => {
    if (!token) return;
    if (append) setLoadingMoreNotifications(true);
    try {
      const [res, countRes] = await Promise.all([
        api.get<NotificationItem[]>("/notifications", {
          params: { offset: append ? notificationsCountRef.current : 0, limit: NOTIFICATIONS_PAGE_SIZE },
        }),
        api.get<UnreadCount>("/notifications/unread-count"),
      ]);
      setNotifications((current) => {
        const next = append ? [...current, ...res.data] : res.data;
        notificationsCountRef.current = next.length;
        return next;
      });
      setHasMoreNotifications(res.data.length === NOTIFICATIONS_PAGE_SIZE);
      setUnreadCount(countRes.data.unread);
    } catch {
      if (!append) {
        setNotifications([]);
        notificationsCountRef.current = 0;
        setHasMoreNotifications(false);
      }
      setUnreadCount(0);
    } finally {
      setLoadingMoreNotifications(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function refreshSoon() {
      if (notificationsRefreshTimer.current) {
        window.clearTimeout(notificationsRefreshTimer.current);
      }
      notificationsRefreshTimer.current = window.setTimeout(() => {
        void loadNotifications();
        notificationsRefreshTimer.current = null;
      }, 350);
    }

    window.addEventListener("smartplanner:notifications-refresh", refreshSoon);
    return () => {
      window.removeEventListener("smartplanner:notifications-refresh", refreshSoon);
      if (notificationsRefreshTimer.current) {
        window.clearTimeout(notificationsRefreshTimer.current);
      }
    };
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
      setUnreadCount(0);
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
        setUnreadCount((current) => Math.max(current - 1, 0));
      } catch {
        void loadNotifications();
      }
    }

    setNotificationsAnchor(null);
    if (opensProjectPlan(notification) && notification.project_id) {
      nav(`/projects/${notification.project_id}?tab=plan`);
      return;
    }
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
    <Stack sx={{ height: "100%", bgcolor: "background.paper", color: "text.primary" }}>
      <Box
        sx={{
          height: headerHeight,
          px: 3,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
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
                color: selected ? "#fff" : "text.secondary",
                "&.Mui-selected": {
                  bgcolor: accent,
                  boxShadow: "0 10px 26px rgba(76,92,104,0.20)",
                  "&:hover": { bgcolor: accentHover },
                },
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)" },
              }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 42 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={<Typography sx={{ fontWeight: 800 }}>{item.label}</Typography>} />
            </ListItemButton>
          );
        })}
      </List>

      {token ? (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", p: 2 }}>
          <Button
            fullWidth
            component={RouterLink}
            to="/account"
            sx={{
              justifyContent: "flex-start",
              color: "text.primary",
              bgcolor: isDark ? "rgba(255,255,255,0.05)" : "#F8FAFC",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              mb: 1.25,
              px: 1.25,
              py: 0.9,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.08)" : "#F1F5F9" },
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
              color: "text.secondary",
              borderColor: "divider",
              "&:hover": { borderColor: "text.secondary", bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.04)" },
            }}
          >
            Deconectare
          </Button>
        </Box>
      ) : null}
    </Stack>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex" }}>
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
            borderRight: "1px solid",
            borderColor: "divider",
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
            bgcolor: isDark ? "rgba(17,24,39,0.86)" : "rgba(255,255,255,0.86)",
            borderBottom: "1px solid",
            borderColor: "divider",
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
                  bgcolor: "background.paper",
                  border: "1px solid",
                  borderColor: "divider",
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
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 8px 22px rgba(15,23,42,0.06)",
                "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.08)" : "#F8FAFC" },
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
              notifications.map((notification) => {
                const planAttention = needsPlanAttention(notification);
                const unreadBg = planAttention
                  ? isDark ? "rgba(245,158,11,0.18)" : "#FFF7ED"
                  : isDark ? "rgba(126,135,159,0.22)" : "#F3F6FF";
                const readBg = planAttention
                  ? isDark ? "rgba(245,158,11,0.10)" : "#FFFBF5"
                  : "background.paper";
                const hoverBg = planAttention
                  ? isDark ? "rgba(245,158,11,0.24)" : "#FFEDD5"
                  : notification.is_read ? (isDark ? "rgba(255,255,255,0.06)" : "#F8FAFC") : (isDark ? "rgba(126,135,159,0.30)" : "#EEF2FF");

                return (
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
                      bgcolor: notification.is_read ? readBg : unreadBg,
                      borderBottom: "1px solid",
                      borderColor: planAttention ? (isDark ? "rgba(245,158,11,0.28)" : "#FED7AA") : "divider",
                      "&:hover": { bgcolor: hoverBg },
                    }}
                  >
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                      <Box
                        sx={{
                          width: planAttention ? 22 : 9,
                          height: planAttention ? 22 : 9,
                          borderRadius: "50%",
                          bgcolor: planAttention ? (isDark ? "rgba(245,158,11,0.18)" : "#FEF3C7") : notification.is_read ? "transparent" : accent,
                          color: planAttention ? "#D97706" : "inherit",
                          mt: planAttention ? 0.1 : 0.75,
                          flexShrink: 0,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {planAttention ? <WarningAmberRoundedIcon sx={{ fontSize: 15 }} /> : null}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: 14 }}>{notification.title}</Typography>
                          {planAttention ? (
                            <Chip
                              size="small"
                              label="Verifică planul"
                              sx={{
                                height: 22,
                                fontWeight: 900,
                                bgcolor: isDark ? "rgba(245,158,11,0.22)" : "#FED7AA",
                                color: isDark ? "#FDBA74" : "#9A3412",
                              }}
                            />
                          ) : null}
                        </Stack>
                        <Typography sx={{ color: "text.secondary", fontSize: 13, mt: 0.25 }}>
                          {formatApiDatesInText(notification.body)}
                        </Typography>
                        <Typography sx={{ color: "text.disabled", fontSize: 12, mt: 0.75 }}>
                          {apiDate(notification.created_at).format("DD MMM YYYY, HH:mm")}
                        </Typography>
                      </Box>
                    </Stack>
                  </Button>
                );
              })
            ) : (
              <Typography sx={{ color: "text.secondary", textAlign: "center", py: 5 }}>
                Nu ai notificări momentan.
              </Typography>
            )}
          </Stack>
          {hasMoreNotifications ? (
            <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => void loadNotifications(true)}
                disabled={loadingMoreNotifications}
                sx={{ fontWeight: 900 }}
              >
                {loadingMoreNotifications ? "Se încarcă..." : "Încarcă mai multe"}
              </Button>
            </Box>
          ) : null}
        </Popover>

        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1320 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
