import { Header } from "@/components/Header";
import { CustomersContent } from "@/components/customers/CustomersContent";

export default function CustomersPage() {
  return (
    <div>
      <Header
        title="Customers"
        subtitle="Manage customers and track outstanding dues"
      />
      <CustomersContent />
    </div>
  );
}
