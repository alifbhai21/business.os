import { Header } from "@/components/Header";
import { ReportsContent } from "@/components/reports/ReportsContent";

export default function ReportsPage() {
  return (
    <div>
      <Header
        title="Reports"
        subtitle="Profit & Loss, Sales Analytics, Receivables & Payables"
      />
      <ReportsContent />
    </div>
  );
}
