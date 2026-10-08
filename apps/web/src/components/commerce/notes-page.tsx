"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-auth";
import { Link } from "@/i18n/navigation";
import { NotesList } from "./returns";

export function NotesPage({ kind }: { kind: "credit" | "debit" }) {
  const t = useTranslations("commerce.notes");
  const can = useCan();
  const credit = kind === "credit";
  return (
    <div className="grid gap-4">
      {can(credit ? "sales.manage" : "purchasing.manage") && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" asChild>
            <Link href={credit ? "/sales/returns/new" : "/purchasing/returns/new"}>
              <Undo2 /> {t(credit ? "newInward" : "newOutward")}
            </Link>
          </Button>
        </div>
      )}
      <NotesList kind={kind} />
    </div>
  );
}
