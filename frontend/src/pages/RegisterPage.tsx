import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, Link, TextField, Typography } from "@mui/material";

import { api } from "../api/api";
import { getApiErrorMessage } from "../api/errors";
import { AuthLayout } from "../components/AuthLayout";

function friendlyMessage(raw: string): string {
  const s = raw.toLowerCase();
  if ((s.includes("already") && s.includes("used")) || (s.includes("exist") && s.includes("cont"))) {
    return "Există deja un cont cu această adresă de email.";
  }
  if (s.includes("valid email") || s.includes("email")) {
    return "Introdu o adresă de email validă.";
  }
  if (s.includes("password") && (s.includes("short") || s.includes("least") || s.includes("min"))) {
    return "Parola trebuie să aibă cel puțin 6 caractere.";
  }
  if (s.includes("name") && (s.includes("short") || s.includes("least") || s.includes("min"))) {
    return "Numele trebuie să aibă cel puțin 2 caractere.";
  }
  if (s.includes("required") || s.includes("missing")) {
    return "Completează toate câmpurile obligatorii.";
  }
  return raw;
}

export function RegisterPage() {
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cleanName = name.trim();
  const cleanEmail = email.trim();

  const emailValid = cleanEmail.includes("@") && cleanEmail.includes(".");
  const nameValid = cleanName.length >= 2;
  const passwordValid = password.length >= 6;

  const formValid = emailValid && nameValid && passwordValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post(
        "/auth/register",
        {
          name: cleanName,
          email: cleanEmail,
          password,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      nav("/login");
    } catch (err: unknown) {
      const raw = getApiErrorMessage(err, "Înregistrarea a eșuat.");
      setError(friendlyMessage(raw));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Înregistrare" subtitle="Creează contul pentru Smart Planner.">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={onSubmit}>
        <TextField
          label="Nume"
          placeholder="Numele tău"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          margin="normal"
          error={name.length > 0 && !nameValid}
          helperText={name.length > 0 && !nameValid ? "Numele trebuie să aibă cel puțin 2 caractere." : ""}
        />

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
          helperText={email.length > 0 && !emailValid ? "Introdu o adresă de email validă." : ""}
        />

        <TextField
          label="Parola"
          placeholder="Minimum 6 caractere"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          margin="normal"
          error={password.length > 0 && !passwordValid}
          helperText={password.length > 0 && !passwordValid ? "Parola trebuie să aibă cel puțin 6 caractere." : ""}
        />

        <Button type="submit" variant="contained" fullWidth disabled={loading || !formValid} sx={{ mt: 2 }}>
          {loading ? "Se creează..." : "Creează cont"}
        </Button>

        <Typography sx={{ mt: 2.5, color: "text.secondary", textAlign: "center" }}>
          Ai deja cont?{" "}
          <Link component={RouterLink} to="/login" sx={{ fontWeight: 800 }}>
            Autentifică-te
          </Link>
        </Typography>
      </Box>
    </AuthLayout>
  );
}
