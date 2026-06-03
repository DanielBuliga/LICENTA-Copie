import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#3F51B5" },
    background: {
      default: "#F7F7F8", // alb-gri foarte deschis
      paper: "#FFFFFF",
    },
    text: {
      primary: "#111827",
      secondary: "#6B7280",
    },
    divider: "rgba(17, 24, 39, 0.08)",
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: ['"Segoe UI Variable Text"', '"Segoe UI"', '"Noto Sans"', "system-ui", "-apple-system", "Arial", "sans-serif"].join(","),
    h4: { fontWeight: 800, letterSpacing: "0" },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 8px 24px rgba(17, 24, 39, 0.06)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(17, 24, 39, 0.06)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingTop: 10,
          paddingBottom: 10,
        },
      },
    },
  },
});
