import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, TextField, Button, Typography, Link, Alert } from "@mui/material";

import { api } from "../api/api";
import { setToken } from "../api/auth";
import { getApiErrorMessage } from "../api/errors";
import type { AuthTokenResponse } from "../api/types";
import { AuthLayout } from "../components/AuthLayout";

function friendlyMessage(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("invalid") || s.includes("incorrect") || s.includes("wrong")) {
    return "Email or password is incorrect";
  }
  return raw;
}

export function LoginPage() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cleanEmail = email.trim();
  const emailValid = cleanEmail.includes("@") && cleanEmail.includes(".");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post<AuthTokenResponse>(
        "/auth/login",
        { email: cleanEmail, password },
        { headers: { "Content-Type": "application/json" } }
      );

      setToken(res.data.access_token);
      nav("/dashboard");
    } catch (err: unknown) {
      const raw = getApiErrorMessage(err, "Login failed");
      setError(friendlyMessage(raw));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Autentificare" subtitle="Continua organizarea proiectelor tale.">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={onSubmit}>
        <TextField
          label="Email"
          placeholder="email@exemplu.com"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          margin="normal"
          error={email.length > 0 && !emailValid}
          helperText={email.length > 0 && !emailValid ? "Introdu o adresă de email validă" : ""}
        />

        <TextField
          label="Parola"
          placeholder="........"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          margin="normal"
        />

        <Button type="submit" variant="contained" fullWidth disabled={loading || !emailValid} sx={{ mt: 2 }}>
          {loading ? "Se autentifică..." : "Autentificare"}
        </Button>

        <Typography sx={{ mt: 2.5, color: "text.secondary", textAlign: "center" }}>
          Nu ai cont?{" "}
          <Link component={RouterLink} to="/register" sx={{ fontWeight: 800 }}>
            Creează unul
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
