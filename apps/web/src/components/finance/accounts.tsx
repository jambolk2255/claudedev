"use client";

import { ACCOUNT_TYPES, type AccountType } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Account } from "@/lib/types";

type Draft = { id?: string; code: string; name: string; type: AccountType; isCash: boolean; active: boolean };

export function useAccounts() {
  return useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api<Account[]>("/finance/accounts") });
}

export function AccountsPage() {
  const t = useTranslations("finance.accounts");
  const tt = useTranslations("finance.types");
  const tc = useTranslations("common");
  const f = useFormat();
  const can = useCan();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(d.id ? `/finance/accounts/${d.id}` : "/finance/accounts", {
        method: d.id ? "PUT" : "POST",
        body: { code: d.code.toUpperCase(), name: d.name, type: d.type, isCash: d.isCash, active: d.active },
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e) => handleFormError(e),
  });

  if (!accounts.data) return <Skeleton className="h-96" />;
  const manage = can("finance.manage");

  return (
    <div className="grid gap-4">
      {manage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDraft({ code: "", name: "", type: "expense", isCash: false, active: true })}>
            <Plus /> {t("new")}
          </Button>
        </div>
      )}
      {ACCOUNT_TYPES.map((type) => {
        const rows = accounts.data.filter((a) => a.type === type);
        if (!rows.length) return null;
        const total = rows.reduce((s, a) => s + (a.balance ?? 0), 0);
        return (
          <Card key={type} className="overflow-hidden">
            <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">{tt(type)}</span>
              <span className="text-sm font-semibold tabular-nums">{f.money(total)}</span>
            </div>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-24">{t("code")}</TH>
                  <TH>{t("name")}</TH>
                  <TH className="hidden text-right md:table-cell">{t("debit")}</TH>
                  <TH className="hidden text-right md:table-cell">{t("credit")}</TH>
                  <TH className="text-right">{t("balance")}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((a) => (
                  <TR
                    key={a.id}
                    className={manage ? "cursor-pointer" : undefined}
                    onClick={() => manage && setDraft({ id: a.id, code: a.code, name: a.name, type: a.type, isCash: a.isCash, active: a.active })}
                  >
                    <TD className="font-mono text-sm">{a.code}</TD>
                    <TD className="text-sm">
                      <span className="flex items-center gap-2">
                        {a.name}
                        {a.systemKey && <Lock className="text-muted-foreground size-3" aria-label={t("system")} />}
                        {a.isCash && <Badge variant="secondary">{t("cash")}</Badge>}
                        {!a.active && <Badge variant="outline">{t("inactive")}</Badge>}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{f.money(a.debit ?? 0)}</TD>
                    <TD className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{f.money(a.credit ?? 0)}</TD>
                    <TD className="text-right font-medium tabular-nums">
                      <Link href={`/finance/journal?account=${a.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {f.money(a.balance ?? 0)}
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        );
      })}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("edit") : t("new")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(draft);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                <Field label={t("code")} htmlFor="a-code">
                  <Input
                    id="a-code"
                    required
                    pattern="[0-9A-Za-z.\-]{2,12}"
                    className="font-mono uppercase"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  />
                </Field>
                <Field label={t("name")} htmlFor="a-name">
                  <Input id="a-name" required minLength={2} maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
              </div>
              <Field label={t("type")} htmlFor="a-type">
                <NativeSelect id="a-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}>
                  {ACCOUNT_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {tt(ty)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {draft.type === "asset" && (
                <label className="flex items-center gap-2.5 text-sm">
                  <Switch checked={draft.isCash} onCheckedChange={(v) => setDraft({ ...draft, isCash: v })} /> {t("isCash")}
                </label>
              )}
              <label className="flex items-center gap-2.5 text-sm">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} /> {t("active")}
              </label>
              <DialogFooter>
                <Button type="submit" loading={save.isPending}>
                  {tc("save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
