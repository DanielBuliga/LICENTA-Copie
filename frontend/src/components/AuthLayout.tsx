import { Box, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccentColor } from "../hooks/useAccentColor";
import { useThemeMode } from "../themeMode";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const accent = useAccentColor();
  const { mode: themeMode, designVariant } = useThemeMode();
  const authMode = location.pathname.includes("register") ? "register" : "login";
  const isDark = themeMode === "dark";
  const isGlass = designVariant === "glass" || designVariant === "blurGlass";
  const isBlurGlass = designVariant === "blurGlass";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDark ? "#111827" : "#F7F7F8",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        px: 2,
        py: 5,
      }}
    >
      <Stack spacing={3} sx={{ width: "100%", maxWidth: 560, alignItems: "center" }}>
        <Stack spacing={1.5} sx={{ alignItems: "center", textAlign: "center" }}>
          <Box
            sx={{
              width: 68,
              height: 68,
              borderRadius: 3,
              bgcolor: accent.value,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              boxShadow: `0 18px 42px ${accent.value}38`,
            }}
          >
            <EventAvailableIcon sx={{ fontSize: 34 }} />
          </Box>
          <Typography component="h1" sx={{ color: isDark ? "#F9FAFB" : "#111827", fontSize: 36, fontWeight: 800, letterSpacing: 0 }}>
            Smart Planner
          </Typography>
          <Typography sx={{ color: isDark ? "#CBD5E1" : "#6B7280", fontSize: 18 }}>Sistem inteligent de planificare</Typography>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            width: "100%",
            p: { xs: 2.5, sm: 3.5 },
            borderRadius: 2.5,
            bgcolor: isGlass ? (isDark ? "rgba(31,41,55,0.56)" : "rgba(255,255,255,0.58)") : isDark ? "#1F2937" : "#FFFFFF",
            backdropFilter: isBlurGlass ? "blur(10px) saturate(1.25)" : isGlass ? "saturate(1.08)" : undefined,
            WebkitBackdropFilter: isBlurGlass ? "blur(10px) saturate(1.25)" : isGlass ? "saturate(1.08)" : undefined,
            border: isGlass
              ? isDark
                ? `1px solid ${accent.value}55`
                : `1px solid ${accent.value}38`
              : isDark
                ? "1px solid rgba(255,255,255,0.10)"
                : "1px solid rgba(17, 24, 39, 0.08)",
            boxShadow: isGlass
              ? isDark
                ? `0 26px 80px rgba(0,0,0,0.34), 0 0 24px ${accent.value}22, inset 0 1px 0 rgba(255,255,255,0.08)`
                : `0 24px 70px rgba(17,24,39,0.12), inset 0 1px 0 rgba(255,255,255,0.9)`
              : isDark
                ? "0 24px 70px rgba(0,0,0,0.28)"
                : "0 24px 70px rgba(17, 24, 39, 0.10)",
          }}
        >
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={authMode}
            onChange={(_, nextMode) => {
              if (nextMode === "login") navigate("/login");
              if (nextMode === "register") navigate("/register");
            }}
            sx={{
              mb: 3,
              bgcolor: isDark ? "rgba(15,23,42,0.72)" : "#EEF0F5",
              borderRadius: 1.5,
              p: 0.5,
              "& .MuiToggleButton-root": {
                border: 0,
                borderRadius: 1.2,
                color: isDark ? "#CBD5E1" : "#6B7280",
                py: 1,
                fontWeight: 800,
                "&.Mui-selected": {
                  bgcolor: accent.value,
                  color: "#fff",
                  "&:hover": { bgcolor: accent.text },
                },
              },
            }}
          >
            <ToggleButton value="login">Autentificare</ToggleButton>
            <ToggleButton value="register">Înregistrare</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ mb: 2 }}>
            <Typography sx={{ color: isDark ? "#F9FAFB" : "#111827", fontSize: 22, fontWeight: 800, textAlign: "center" }}>
              {title}
            </Typography>
            <Typography sx={{ color: isDark ? "#CBD5E1" : "#6B7280", textAlign: "center" }}>{subtitle}</Typography>
          </Box>

          <Box
            sx={{
              "& .MuiFormLabel-root": { color: isDark ? "#E5E7EB" : "#374151", fontWeight: 700 },
              "& .MuiInputBase-root": {
                color: isDark ? "#F9FAFB" : "#111827",
                bgcolor: isDark ? "#111827" : "#F8FAFC",
                borderRadius: 1.2,
              },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(17, 24, 39, 0.12)" },
              "& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: `${accent.value}70`,
              },
              "& .MuiInputBase-input::placeholder": { color: isDark ? "#94A3B8" : "#9CA3AF", opacity: 1 },
              "& .MuiFormHelperText-root": { color: "#DC2626" },
              "& .MuiButton-contained": {
                bgcolor: accent.value,
                boxShadow: "none",
                "&:hover": { bgcolor: accent.text, boxShadow: "none" },
                "&.Mui-disabled": {
                  bgcolor: isDark ? "rgba(148,163,184,0.24)" : "rgba(17,24,39,0.12)",
                  color: isDark ? "rgba(241,245,249,0.70)" : "rgba(17,24,39,0.38)",
                },
              },
              "& a": { color: isDark ? "#E2E8F0" : accent.text },
            }}
          >
            {children}
          </Box>
        </Paper>

      </Stack>
    </Box>
  );
}
