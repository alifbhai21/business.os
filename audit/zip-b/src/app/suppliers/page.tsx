import { Header } from "@/components/Header";
import { SuppliersContent } from "@/components/suppliers/SuppliersContent";

export default function SuppliersPage() {
  return (
    <div>
      <Header title="Suppliers" subtitle="Manage suppliers and track payables" />
      <SuppliersContent />
    </div>
  );
}
