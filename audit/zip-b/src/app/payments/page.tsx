import { Header } from "@/components/Header";
import { PaymentsContent } from "@/components/payments/PaymentsContent";

export default function PaymentsPage() {
  return (
    <div>
      <Header
        title="Payments"
        subtitle="Track all customer and supplier payment transactions"
      />
      <PaymentsContent />
    </div>
  );
}
