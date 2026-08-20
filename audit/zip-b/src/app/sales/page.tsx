import { Header } from "@/components/Header";
import { SalesContent } from "@/components/sales/SalesContent";

export default function SalesPage() {
  return (
    <div>
      <Header title="Sales" subtitle="Manage sales transactions and invoices" />
      <SalesContent />
    </div>
  );
}
