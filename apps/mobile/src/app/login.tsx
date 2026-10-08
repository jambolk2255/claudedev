import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Body, Button, Field, H1, Screen, Small } from "@/components/ui";
import { getServer, loadServer, setServer } from "@/lib/api";
import { isApiError, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

export default function LoginScreen() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const c = useTheme();
  const [server, setServerText] = useState(getServer());
  const [editServer, setEditServer] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadServer().then(setServerText);
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await setServer(server);
      const res = await login(email.trim(), password, needsTotp ? totp : undefined);
      if ("twoFactor" in res) setNeedsTotp(true);
    } catch (err) {
      if (isApiError(err)) {
        setError(
          err.code === "NETWORK"
            ? t("login.network")
            : err.code === "LOCKED"
              ? t("login.locked")
              : err.code === "INVALID_TOTP"
                ? t("login.badCode")
                : err.status === 401
                  ? t("login.invalid")
                  : err.message,
        );
      } else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable onPress={() => setLang(lang === "en" ? "si" : "en")} hitSlop={10}>
            <Body style={{ color: c.primary, fontWeight: "600" }}>{lang === "en" ? "සිංහල" : "English"}</Body>
          </Pressable>
        </View>
        <View style={{ alignItems: "center", gap: space(3), marginTop: space(8), marginBottom: space(6) }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="cube" size={34} color="#fff" />
          </View>
          <H1>{needsTotp ? t("login.twoFactorTitle") : t("login.title")}</H1>
          <Body muted style={{ textAlign: "center" }}>
            {needsTotp ? t("login.twoFactorBody") : t("login.subtitle")}
          </Body>
        </View>

        {needsTotp ? (
          <Field label={t("login.code")} value={totp} onChangeText={setTotp} keyboardType="number-pad" maxLength={6} autoFocus textContentType="oneTimeCode" />
        ) : (
          <>
            <Field
              label={t("login.email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
            />
            <Field
              label={t("login.password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
            />
          </>
        )}
        {error && <Body style={{ color: c.danger }}>{error}</Body>}
        <Button
          title={needsTotp ? t("login.verify") : t("login.submit")}
          onPress={submit}
          loading={busy}
          size="lg"
          disabled={needsTotp ? totp.length !== 6 : !email || !password}
        />
        {needsTotp && <Button title={t("common.back")} variant="ghost" onPress={() => (setNeedsTotp(false), setTotp(""))} />}

        <View style={{ marginTop: space(6), gap: space(2) }}>
          {editServer ? (
            <Field
              label={t("login.server")}
              value={server}
              onChangeText={setServerText}
              autoCapitalize="none"
              keyboardType="url"
              hint={t("login.serverHint")}
            />
          ) : (
            <Pressable onPress={() => setEditServer(true)} style={{ alignItems: "center" }}>
              <Small>
                {t("login.connectedTo")} {server.replace(/^https?:\/\//, "")} · <Small style={{ color: c.primary }}>{t("login.change")}</Small>
              </Small>
            </Pressable>
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
