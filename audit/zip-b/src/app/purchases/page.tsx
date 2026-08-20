import { Header } from "@/components/Header";
import { PurchasesContent } from "@/components/purchases/PurchasesContent";

export default function PurchasesPage() {
  return (
    <div>
      <Header title="Purchases" subtitle="Record stock purchases from suppliers" />
      <PurchasesContent />
    </div>
  );
}
