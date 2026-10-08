import { useColorScheme } from "react-native";

const light = {
  bg: "#F7F7FB",
  card: "#FFFFFF",
  text: "#18181B",
  muted: "#71717A",
  border: "#E4E4E7",
  primary: "#5B4BDB",
  primaryText: "#FFFFFF",
  primarySoft: "#EEECFC",
  success: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
};
export type Theme = typeof light;

const dark: Theme = {
  bg: "#14131F",
  card: "#1D1C2B",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  border: "#2E2D3D",
  primary: "#7C6FF0",
  primaryText: "#FFFFFF",
  primarySoft: "#2A2650",
  success: "#22C55E",
  successSoft: "#14321F",
  warning: "#F59E0B",
  warningSoft: "#3A2A0B",
  danger: "#F87171",
  dangerSoft: "#3B1717",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16 };
export const space = (n: number) => n * 4;
