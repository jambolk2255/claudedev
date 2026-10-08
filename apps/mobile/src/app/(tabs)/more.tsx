import { Alert, View } from "react-native";
import { Badge, Body, Button, Card, Divider, H1, ListRow, Screen, Small } from "@/components/ui";
import { getServer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";
import Constants from "expo-constants";

export default function MoreScreen() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Screen>
      <H1>{t("more.title")}</H1>
      <Card>
        <Body style={{ fontWeight: "600", fontSize: 17 }}>{user.name}</Body>
        <Small>{user.email}</Small>
        <View style={{ flexDirection: "row", gap: space(2), marginTop: space(1) }}>
          <Badge label={user.role.name} />
          {user.subscription && <Badge label={user.subscription.planName} tone={user.subscription.readOnly ? "danger" : "muted"} />}
        </View>
      </Card>
      <Card style={{ paddingVertical: space(1) }}>
        <ListRow icon="business-outline" title={user.organization.name} subtitle={getServer().replace(/^https?:\/\//, "")} />
        <Divider />
        <ListRow
          icon="language-outline"
          title={t("more.language")}
          right={lang === "en" ? "English" : "සිංහල"}
          onPress={() => setLang(lang === "en" ? "si" : "en")}
        />
      </Card>
      <Button
        title={t("more.logout")}
        variant="outline"
        icon="log-out-outline"
        onPress={() =>
          Alert.alert(t("more.logoutTitle"), t("more.logoutBody"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("more.logout"), style: "destructive", onPress: () => void logout() },
          ])
        }
      />
      <Small style={{ textAlign: "center" }}>StockFlow {Constants.expoConfig?.version}</Small>
    </Screen>
  );
}
