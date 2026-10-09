import { useColorScheme } from "react-native";
import { useSettings } from "./settings";

/** Agent X palette: royal blue + near-black + white. Red is reserved for overdue/destructive. */
const dark = {
  bg: "#0B0D12",
  card: "#141821",
  card2: "#1B2030",
  text: "#FFFFFF",
  muted: "#9AA3B5",
  border: "#262C3B",
  primary: "#2D5BFF",
  primaryBright: "#5B7CFF",
  primaryText: "#FFFFFF",
  primarySoft: "rgba(45, 91, 255, 0.16)",
  danger: "#FF4D4F",
  dangerSoft: "rgba(255, 77, 79, 0.12)",
  ink: "#0B0D12",
};
export type Theme = typeof dark & { dark: boolean };

const light: typeof dark = {
  bg: "#FFFFFF",
  card: "#F4F6FA",
  card2: "#E9EDF5",
  text: "#0B0D12",
  muted: "#5B6475",
  border: "#DDE2EC",
  primary: "#2D5BFF",
  primaryBright: "#2D5BFF",
  primaryText: "#FFFFFF",
  primarySoft: "rgba(45, 91, 255, 0.10)",
  danger: "#E5383B",
  dangerSoft: "rgba(229, 56, 59, 0.08)",
  ink: "#0B0D12",
};

export function useTheme(): Theme {
  const system = useColorScheme();
  const { settings } = useSettings();
  const isDark = settings.theme === "system" ? system !== "light" : settings.theme === "dark";
  return isDark ? { ...dark, dark: true } : { ...light, dark: false };
}

export const radius = { sm: 10, md: 14, lg: 18, xl: 22 };
export const space = (n: number) => n * 4;
