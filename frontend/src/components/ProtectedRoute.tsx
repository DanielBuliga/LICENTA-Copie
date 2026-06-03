import { Navigate } from "react-router-dom";
import { hasValidToken } from "../api/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!hasValidToken()) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
