import { useCallback, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning";
};

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions({
        confirmLabel: "Șterge",
        cancelLabel: "Anulează",
        tone: "danger",
        ...nextOptions,
      });
    });
  }, []);

  const confirmDialog = (
    <Dialog open={Boolean(options)} onClose={() => close(false)} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <WarningAmberRoundedIcon color={options?.tone === "warning" ? "warning" : "error"} />
          <Typography variant="h6">{options?.title}</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: "text.secondary" }}>{options?.description}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => close(false)}>{options?.cancelLabel ?? "Anulează"}</Button>
        <Button
          variant="contained"
          color={options?.tone === "warning" ? "warning" : "error"}
          onClick={() => close(true)}
        >
          {options?.confirmLabel ?? "Șterge"}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
