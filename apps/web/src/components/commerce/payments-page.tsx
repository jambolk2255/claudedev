"use client";

import { Banknote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-auth";
import { PaymentSheet } from "./payment-sheet";
import { PaymentsList } from "./payments-list";

export function PaymentsPage({ kind }: { kind: "receipt" | "payment" }) {
  const t = useTranslations("commerce.payments");
  const can = useCan();
  const [open, setOpen] = useState(false);
  const canCreate = can("finance.manage") || (kind === "receipt" && can("sales.manage"));
  return (
    <div className="grid gap-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Banknote /> {t(kind === "receipt" ? "newReceipt" : "newPayment")}
          </Button>
        </div>
      )}
      <PaymentsList kind={kind} />
      {open && <PaymentSheet kind={kind} open={open} onOpenChange={setOpen} />}
    </div>
  );
}
