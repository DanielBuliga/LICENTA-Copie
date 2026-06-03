/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from "react";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { useAccentColor } from "./hooks/useAccentColor";

type ThemeMode = "light" | "dark";
export type DesignVariant = "standard" | "glass" | "blurGlass";

type ThemeModeContextValue = {
  mode: ThemeMode;
  designVariant: DesignVariant;
  toggleMode: () => void;
  setDesignVariant: (variant: DesignVariant) => void;
};

const THEME_MODE_KEY = "smart_planner_theme_mode";
const DESIGN_VARIANT_KEY = "smart_planner_design_variant";
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function getInitialMode(): ThemeMode {
  return localStorage.getItem(THEME_MODE_KEY) === "dark" ? "dark" : "light";
}

function getInitialDesignVariant(): DesignVariant {
  const stored = localStorage.getItem(DESIGN_VARIANT_KEY);
  if (stored === "glass" || stored === "blurGlass") return stored;
  return "standard";
}

export function useThemeMode() {
  const value = useContext(ThemeModeContext);
  if (!value) throw new Error("useThemeMode must be used inside AppThemeProvider");
  return value;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const accent = useAccentColor();
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);
  const [designVariant, setDesignVariantState] = useState<DesignVariant>(getInitialDesignVariant);
  const isGlass = designVariant === "glass" || designVariant === "blurGlass";
  const isBlurGlass = designVariant === "blurGlass";

  const contextValue = useMemo(
    () => ({
      mode,
      designVariant,
      toggleMode: () => {
        setMode((current) => {
          const next = current === "light" ? "dark" : "light";
          localStorage.setItem(THEME_MODE_KEY, next);
          return next;
        });
      },
      setDesignVariant: (variant: DesignVariant) => {
        localStorage.setItem(DESIGN_VARIANT_KEY, variant);
        setDesignVariantState(variant);
      },
    }),
    [designVariant, mode]
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: accent.value },
          background: {
            default: mode === "light" ? "#F4F6FA" : "#111827",
            paper: mode === "light" ? "#FFFFFF" : "#1F2937",
          },
          text: {
            primary: mode === "light" ? "#111827" : "#F9FAFB",
            secondary: mode === "light" ? "#6B7280" : "#CBD5E1",
          },
          divider: mode === "light" ? "rgba(17, 24, 39, 0.08)" : "rgba(255,255,255,0.10)",
        },
        shape: { borderRadius: 14 },
        typography: {
          fontFamily: ['"Segoe UI Variable Text"', '"Segoe UI"', '"Noto Sans"', "system-ui", "-apple-system", "Arial", "sans-serif"].join(","),
          h4: { fontWeight: 800, letterSpacing: "0" },
          h6: { fontWeight: 800 },
          button: { textTransform: "none", fontWeight: 700 },
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                backgroundColor: isGlass
                  ? mode === "light"
                    ? "rgba(255,255,255,0.72)"
                    : "rgba(31,41,55,0.62)"
                  : undefined,
                backdropFilter: isBlurGlass ? "blur(8px)" : undefined,
                WebkitBackdropFilter: isBlurGlass ? "blur(8px)" : undefined,
                border: isGlass
                  ? mode === "light"
                    ? `1px solid ${accent.value}42`
                    : `1px solid ${accent.value}52`
                  : mode === "light"
                    ? "1px solid rgba(17, 24, 39, 0.08)"
                    : "1px solid rgba(255,255,255,0.10)",
                boxShadow: isGlass
                  ? mode === "light"
                    ? `0 18px 44px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.90)`
                    : `0 18px 48px rgba(0,0,0,0.26), 0 0 18px ${accent.value}18, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : mode === "light"
                    ? "0 10px 28px rgba(15,23,42,0.06)"
                    : "0 16px 38px rgba(0,0,0,0.18)",
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                backgroundColor: isGlass
                  ? mode === "light"
                    ? "rgba(255,255,255,0.76)"
                    : "rgba(31,41,55,0.68)"
                  : undefined,
                backdropFilter: isBlurGlass ? "blur(8px)" : undefined,
                WebkitBackdropFilter: isBlurGlass ? "blur(8px)" : undefined,
                border: isGlass
                  ? mode === "light"
                    ? `1px solid ${accent.value}38`
                    : `1px solid ${accent.value}45`
                  : mode === "light"
                    ? "1px solid rgba(17, 24, 39, 0.06)"
                    : "1px solid rgba(255,255,255,0.10)",
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
      }),
    [accent.value, isBlurGlass, isGlass, mode]
  );

  return (
    <ThemeModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            body: {
              backgroundColor: theme.palette.background.default,
            },
            ...(isGlass
              ? {
                  ".MuiCard-root, .MuiPaper-root:not(.MuiDrawer-paper):not(.MuiPopover-paper):not(.MuiMenu-paper)": {
                    position: "relative",
                    overflow: "hidden",
                    background:
                      mode === "light"
                        ? isBlurGlass
                          ? `linear-gradient(135deg, rgba(255,255,255,0.50) 0%, ${accent.value}18 42%, rgba(255,255,255,0.38) 100%) !important`
                          : `linear-gradient(135deg, rgba(255,255,255,0.72) 0%, ${accent.value}12 42%, rgba(255,255,255,0.54) 100%) !important`
                        : isBlurGlass
                          ? `linear-gradient(135deg, rgba(31,41,55,0.46) 0%, ${accent.value}24 46%, rgba(17,24,39,0.34) 100%) !important`
                          : `linear-gradient(135deg, rgba(31,41,55,0.70) 0%, ${accent.value}1C 46%, rgba(31,41,55,0.52) 100%) !important`,
                    backdropFilter: isBlurGlass ? "blur(18px) saturate(1.35)" : "saturate(1.12)",
                    WebkitBackdropFilter: isBlurGlass ? "blur(18px) saturate(1.35)" : "saturate(1.12)",
                    border:
                      mode === "light"
                        ? `1px solid rgba(255,255,255,0.86) !important`
                        : `1px solid ${accent.value}66 !important`,
                    boxShadow:
                      mode === "light"
                        ? `0 22px 54px rgba(15,23,42,0.14), 0 0 0 1px ${accent.value}22, inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 ${accent.value}20 !important`
                        : `0 22px 58px rgba(0,0,0,0.34), 0 0 24px ${accent.value}34, inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 ${accent.value}36 !important`,
                  },
                  ".MuiCard-root::before, .MuiPaper-root:not(.MuiDrawer-paper):not(.MuiPopover-paper):not(.MuiMenu-paper)::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    borderRadius: "inherit",
                    background:
                      mode === "light"
                        ? "linear-gradient(135deg, rgba(255,255,255,0.95), transparent 34%), linear-gradient(315deg, rgba(255,255,255,0.42), transparent 38%)"
                        : "linear-gradient(135deg, rgba(255,255,255,0.14), transparent 34%), linear-gradient(315deg, rgba(255,255,255,0.06), transparent 38%)",
                    opacity: isBlurGlass ? 0.72 : 0.95,
                  },
                  ".MuiCard-root::after, .MuiPaper-root:not(.MuiDrawer-paper):not(.MuiPopover-paper):not(.MuiMenu-paper)::after": {
                    content: '""',
                    position: "absolute",
                    inset: "1px",
                    pointerEvents: "none",
                    borderRadius: "inherit",
                    boxShadow:
                      mode === "light"
                        ? `inset 0 0 0 1px rgba(255,255,255,0.72), inset 0 0 28px ${accent.value}14`
                        : `inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 30px ${accent.value}22`,
                  },
                  ".MuiDrawer-paper": {
                    height: "100% !important",
                    overflow: "hidden !important",
                    background:
                      mode === "light"
                        ? isBlurGlass
                          ? `linear-gradient(135deg, rgba(255,255,255,0.68), ${accent.value}12) !important`
                          : `linear-gradient(135deg, rgba(255,255,255,0.86), ${accent.value}0F) !important`
                        : isBlurGlass
                          ? `linear-gradient(135deg, rgba(17,24,39,0.76), ${accent.value}20) !important`
                          : `linear-gradient(135deg, rgba(17,24,39,0.92), ${accent.value}18) !important`,
                    backdropFilter: isBlurGlass ? "blur(18px) saturate(1.35)" : "saturate(1.12)",
                    WebkitBackdropFilter: isBlurGlass ? "blur(18px) saturate(1.35)" : "saturate(1.12)",
                  },
                }
              : {}),
          }}
        />
        <LocalizationProvider dateAdapter={AdapterDayjs}>{children}</LocalizationProvider>
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
