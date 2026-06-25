import axios from "axios";

type ApiValidationItem = {
  msg?: string;
};

type ApiErrorDetail = string | ApiValidationItem[] | { msg?: string };

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const detail = error.response?.data?.detail as ApiErrorDetail | undefined;

  if (!detail) return fallback;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const msg = detail[0]?.msg;
    return typeof msg === "string" ? msg : "Datele introduse nu sunt valide.";
  }

  const msg = detail.msg;
  return typeof msg === "string" ? msg : fallback;
}
