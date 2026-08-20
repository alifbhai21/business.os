import { Header } from "@/components/Header";
import { InventoryContent } from "@/components/inventory/InventoryContent";

export default function InventoryPage() {
  return (
    <div>
      <Header
        title="Inventory"
        subtitle="Stock levels, valuations and movement reports"
      />
      <InventoryContent />
    </div>
  );
}
