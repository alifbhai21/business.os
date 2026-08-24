import React, { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "./components/ui";
import { useI18n } from "./i18n";
import { colors } from "../src/theme";

/**
 * Phase 12 — barcode scanner modal (expo-camera CameraView).
 *
 * The scanner only IDENTIFIES a code: the resolved lookup (tenant-scoped,
 * RBAC-checked) happens against the server afterwards by the caller. A
 * manual-entry field is always available so the flow works on simulators,
 * web, or when the camera permission is denied.
 */

export function BarcodeScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called once per scanned code while the modal stays open. */
  onScanned: (data: string) => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!visible) {
      setManual("");
      setLocked(false);
    }
  }, [visible]);

  const handleScan = ({ data }: { data: string }) => {
    if (locked || !data) return;
    setLocked(true); // one result per open — avoids double-fire loops
    onScanned(data);
  };

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    setLocked(true);
    onScanned(code);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{t("scanBarcode")}</Text>

        {Platform.OS !== "web" && permission && !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.muted}>{t("cameraPermission")}</Text>
            <Button title={t("grantCamera")} onPress={() => void requestPermission()} />
          </View>
        ) : Platform.OS !== "web" && permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "code128", "code39", "qr", "upc_a", "upc_e"],
              }}
              onBarcodeScanned={handleScan}
            />
          </View>
        ) : (
          <View style={styles.center}>
            <Text style={styles.muted}>{t("cameraUnavailable")}</Text>
          </View>
        )}

        <View style={styles.manualWrap}>
          <Text style={styles.muted}>{t("orEnterBarcode")}</Text>
          <TextInput
            style={styles.input}
            value={manual}
            onChangeText={setManual}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={submitManual}
            placeholder="8901234567890"
          />
          <Button title={t("useCode")} onPress={submitManual} />
          <Button title={t("cancel")} onPress={onClose} variant="secondary" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 12 },
  cameraWrap: { flex: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" },
  camera: { ...StyleSheet.absoluteFill, flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { fontSize: 13, color: colors.textMuted },
  manualWrap: { gap: 8, paddingBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: "#fff",
  },
});
