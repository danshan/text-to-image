import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const storageKey = "text-to-image:theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  const update = (value: ThemePreference) => {
    setPreference(value);
    if (value === "system") window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, value);
  };

  return { preference, setPreference: update };
}
