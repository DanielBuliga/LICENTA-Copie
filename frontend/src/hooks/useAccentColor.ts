import { useEffect, useState } from "react";
import { getStoredAccent, type AccentColor } from "../themeColors";

export function useAccentColor(): AccentColor {
  const [accent, setAccent] = useState(getStoredAccent);

  useEffect(() => {
    function syncAccent() {
      setAccent(getStoredAccent());
    }

    window.addEventListener("smart-planner-accent-change", syncAccent);
    window.addEventListener("storage", syncAccent);

    return () => {
      window.removeEventListener("smart-planner-accent-change", syncAccent);
      window.removeEventListener("storage", syncAccent);
    };
  }, []);

  return accent;
}
