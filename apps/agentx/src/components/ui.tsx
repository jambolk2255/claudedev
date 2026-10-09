import { Ionicons } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, space, useTheme } from "@/lib/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ["top"],
  bottomPad = 120,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom")[];
  bottomPad?: number;
}) {
  const c = useTheme();
  const pad = { paddingHorizontal: space(4.5), paddingTop: space(2), gap: space(3) };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function BrandMark() {
  const c = useTheme();
  return <Text style={{ color: c.primaryBright, fontSize: 13, fontWeight: "800", letterSpacing: 1.6 }}>AGENT X</Text>;
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[{ fontSize: 26, fontWeight: "700", color: c.text, letterSpacing: -0.3 }, style]}>{children}</Text>;
}

export function Body({
  children,
  style,
  muted,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
  numberOfLines?: number;
}) {
  const c = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 22, color: muted ? c.muted : c.text }, style]}>
      {children}
    </Text>
  );
}

export function Small({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[{ fontSize: 12, lineHeight: 17, color: c.muted }, style]}>{children}</Text>;
}

export function SectionTitle({ title, right, tone }: { title: string; right?: string; tone?: "danger" }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: space(3), paddingHorizontal: 2 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: tone === "danger" ? c.danger : c.text }}>{title}</Text>
      {right ? <Small>{right}</Small> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useTheme();
  const base: ViewStyle = { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space(4), gap: space(2) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.75 }, style]}>
      {children}
    </Pressable>
  );
}

/** Grouped list container with dividers between rows. */
export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" }, style]}>{children}</View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  emoji,
  right,
  onPress,
  last,
  danger,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  emoji?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        paddingHorizontal: space(4),
        paddingVertical: space(3.5),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
        opacity: pressed ? 0.6 : 1,
        minHeight: 52,
      })}
    >
      {icon ? <Ionicons name={icon} size={20} color={danger ? c.danger : c.primaryBright} /> : null}
      {emoji ? <Text style={{ fontSize: 18 }}>{emoji}</Text> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: danger ? c.danger : c.text }}>{title}</Text>
        {subtitle ? <Small>{subtitle}</Small> : null}
      </View>
      {typeof right === "string" ? <Small>{right}</Small> : right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={16} color={c.muted} /> : null}
    </Pressable>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = useTheme();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />;
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const bg = variant === "primary" ? c.primary : variant === "outline" ? c.card : "transparent";
  const fg = variant === "primary" ? c.primaryText : variant === "danger" ? c.danger : variant === "outline" ? c.text : c.primaryBright;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 52,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: variant === "outline" || variant === "danger" ? 1 : 0,
          borderColor: variant === "danger" ? c.danger : c.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space(2),
          paddingHorizontal: space(4),
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 15, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label?: string; hint?: string }>(function Field({ label, hint, style, ...props }, ref) {
  const c = useTheme();
  return (
    <View style={{ gap: space(1.5) }}>
      {label ? <Text style={{ fontSize: 13, fontWeight: "600", color: c.text }}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.muted}
        style={[
          {
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card2,
            paddingHorizontal: space(3.5),
            paddingVertical: space(2.5),
            fontSize: 16,
            color: c.text,
          },
          style,
        ]}
        {...props}
      />
      {hint ? <Small>{hint}</Small> : null}
    </View>
  );
});

export function Chip({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: "danger" }) {
  const c = useTheme();
  const color = tone === "danger" ? c.danger : c.primaryBright;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: space(3.5),
        height: 38,
        justifyContent: "center",
        borderRadius: 999,
        backgroundColor: active ? (tone === "danger" ? c.danger : c.primary) : c.card,
        borderWidth: 1,
        borderColor: active ? "transparent" : c.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: active ? "#FFFFFF" : tone ? color : c.text, fontSize: 14, fontWeight: active ? "600" : "500" }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>{children}</View>;
}

export function Tag({ label, tone }: { label: string; tone?: "danger" }) {
  const c = useTheme();
  return (
    <View style={{ backgroundColor: tone === "danger" ? c.dangerSoft : c.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: tone === "danger" ? c.danger : c.dark ? c.primaryBright : c.primary, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: radius.sm,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={c.text} />
    </Pressable>
  );
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(10) }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={26} color={c.primaryBright} />
      </View>
      <Body style={{ fontWeight: "600" }}>{title}</Body>
      {body ? <Small style={{ textAlign: "center", maxWidth: 280 }}>{body}</Small> : null}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ flex: 1, paddingVertical: space(10), alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}
