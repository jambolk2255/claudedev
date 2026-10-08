import { Ionicons } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
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
  padded = true,
  edges = ["top"],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ("top" | "bottom")[];
}) {
  const c = useTheme();
  const pad = padded ? { padding: space(4), gap: space(3) } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: space(10) }]}
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

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[{ fontSize: 26, fontWeight: "700", color: c.text, letterSpacing: -0.3 }, style]}>{children}</Text>;
}

export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[{ fontSize: 17, fontWeight: "600", color: c.text }, style]}>{children}</Text>;
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
    <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, color: muted ? c.muted : c.text }, style]}>
      {children}
    </Text>
  );
}

export function Small({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  return <Text style={[{ fontSize: 12, color: c.muted }, style]}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useTheme();
  const base: ViewStyle = { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space(4), gap: space(2) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.7 }, style]}>
      {children}
    </Pressable>
  );
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
  size = "md",
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "md" | "lg";
  testID?: string;
}) {
  const c = useTheme();
  const bg = variant === "primary" ? c.primary : variant === "danger" ? c.danger : "transparent";
  const fg = variant === "primary" || variant === "danger" ? c.primaryText : variant === "outline" ? c.text : c.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: size === "lg" ? 54 : 46,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: c.border,
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
      <Text style={{ color: fg, fontSize: size === "lg" ? 17 : 15, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string }>(function Field(
  { label, error, hint, style, ...props },
  ref,
) {
  const c = useTheme();
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: c.text }}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.muted}
        style={[
          {
            height: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.danger : c.border,
            backgroundColor: c.card,
            paddingHorizontal: space(3.5),
            fontSize: 16,
            color: c.text,
          },
          style,
        ]}
        {...props}
      />
      {error ? <Text style={{ fontSize: 12, color: c.danger }}>{error}</Text> : hint ? <Small>{hint}</Small> : null}
    </View>
  );
});

export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" | "danger" | "muted" }) {
  const c = useTheme();
  const map = {
    default: [c.primarySoft, c.primary],
    success: [c.successSoft, c.success],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
    muted: [c.border, c.muted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  rightSub,
  icon,
  onPress,
  ...rest
}: { title: string; subtitle?: string; right?: string; rightSub?: React.ReactNode; icon?: IconName; onPress?: () => void } & Omit<
  PressableProps,
  "children" | "style"
>) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3), opacity: pressed && onPress ? 0.6 : 1 })}
      {...rest}
    >
      {icon && (
        <View style={{ width: 38, height: 38, borderRadius: radius.sm, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={18} color={c.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "500", color: c.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {(right || rightSub) && (
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {right ? <Text style={{ fontSize: 15, fontWeight: "600", color: c.text, fontVariant: ["tabular-nums"] }}>{right}</Text> : null}
          {typeof rightSub === "string" ? <Small>{rightSub}</Small> : rightSub}
        </View>
      )}
      {onPress && <Ionicons name="chevron-forward" size={16} color={c.muted} />}
    </Pressable>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", gap: space(2), paddingVertical: space(10) }}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.border, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={24} color={c.muted} />
      </View>
      <Body style={{ fontWeight: "600" }}>{title}</Body>
      {body ? <Small style={{ textAlign: "center", maxWidth: 260 }}>{body}</Small> : null}
    </View>
  );
}

export function Stat({ label, value, icon, tone }: { label: string; value: string; icon: IconName; tone?: "danger" | "warning" }) {
  const c = useTheme();
  const color = tone === "danger" ? c.danger : tone === "warning" ? c.warning : c.text;
  return (
    <Card style={{ flex: 1, minWidth: "45%", gap: space(1) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={icon} size={14} color={c.muted} />
        <Small>{label}</Small>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "700", color, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </Card>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.border, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 36,
              borderRadius: radius.sm,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? c.card : "transparent",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: active ? "600" : "500", color: active ? c.text : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ paddingVertical: space(10), alignItems: "center" }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}
