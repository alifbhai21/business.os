import { Header } from "@/components/Header";
import { SettingsContent } from "@/components/settings/SettingsContent";

export default function SettingsPage() {
  return (
    <div>
      <Header title="Settings" subtitle="Business configuration and preferences" />
      <SettingsContent />
    </div>
  );
}
