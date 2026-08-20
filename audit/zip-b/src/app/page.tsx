import { Header } from "@/components/Header";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export default function DashboardPage() {
  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Welcome back! Here's your business overview."
      />
      <DashboardContent />
    </div>
  );
}
