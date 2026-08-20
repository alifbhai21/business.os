import { Header } from "@/components/Header";
import { ExpensesContent } from "@/components/expenses/ExpensesContent";

export default function ExpensesPage() {
  return (
    <div>
      <Header title="Expenses" subtitle="Track business operating expenses" />
      <ExpensesContent />
    </div>
  );
}
