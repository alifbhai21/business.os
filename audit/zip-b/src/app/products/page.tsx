import { Header } from "@/components/Header";
import { ProductsContent } from "@/components/products/ProductsContent";

export default function ProductsPage() {
  return (
    <div>
      <Header title="Products" subtitle="Manage your product catalog" />
      <ProductsContent />
    </div>
  );
}
