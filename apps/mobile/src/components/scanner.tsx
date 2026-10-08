import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui";

const TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "qr", "datamatrix"];

/** Full-screen barcode scanner. Calls onScan once per opening. */
export function ScannerModal({ visible, onClose, onScan, title }: { visible: boolean; onClose: () => void; onScan: (code: string) => void; title?: string }) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => (done.current = false)}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: TYPES }}
            onBarcodeScanned={({ data }) => {
              if (done.current || !data) return;
              done.current = true;
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onScan(data);
            }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text style={{ color: "#fff", textAlign: "center", fontSize: 16 }}>{t("scanner.permission")}</Text>
            <Button title={t("scanner.allow")} onPress={() => void requestPermission()} />
          </View>
        )}
        <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}>{title ?? t("scanner.title")}</Text>
            <Pressable
              accessibilityLabel={t("common.close")}
              onPress={onClose}
              hitSlop={12}
              style={{ backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 20, padding: 8 }}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          {permission?.granted && (
            <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 260, height: 160, borderWidth: 3, borderColor: "#fff", borderRadius: 18, opacity: 0.9 }} />
              <Text style={{ color: "#fff", marginTop: 16, opacity: 0.85 }}>{t("scanner.hint")}</Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
