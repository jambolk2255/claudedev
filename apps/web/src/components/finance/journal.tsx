"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ListSkeleton, PAGE_SIZE, todayIso, usePagedList } from "@/components/commerce/ui";
import { EmptyState, FilterSelect, Pagination, SearchInput, Toolbar } from "@/components/data/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCan } from "@/hooks/use-auth";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import type { Dec } from "@/lib/types";
import { useAccounts } from "./accounts";

interface Entry {
  id: string;
  number: string;
  entryDate: string;
  sourceType: string;
  memo: string | null;
  lines: { id: string; debit: Dec; credit: Dec; memo: string | null; account: { code: string; name: string }; partner: { name: string } | null }[];
}

export function JournalPage({ initialAccount }: { initialAccount?: string }) {
  const t = useTranslations("finance.journal");
  const f = useFormat();
  const can = useCan();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState(initialAccount ?? "");
  const [open, setOpen] = useState(false);
  const { query, search, setSearch, page, setPage } = usePagedList<Entry>("/finance/journals", "finance", { accountId: accountId || undefined });

  return (
    <div className="grid gap-4">
      {can("finance.post") && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> {t("new")}
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder={t("search")} className="min-w-56 flex-1" />
          <FilterSelect
            label={t("account")}
            value={accountId}
            onChange={setAccountId}
            options={[{ value: "", label: t("allAccounts") }, ...(accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))]}
          />
        </Toolbar>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.data?.items.length === 0 ? (
          <EmptyState icon={BookOpen} title={t("empty")} />
        ) : (
          <ul className={query.isPlaceholderData ? "divide-y opacity-60" : "divide-y"}>
            {query.data?.items.map((e) => (
              <li key={e.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{e.number}</span>
                  <Badge variant="secondary">{t.has(`sources.${e.sourceType}`) ? t(`sources.${e.sourceType}`) : e.sourceType}</Badge>
                  <span className="text-muted-foreground truncate">{e.memo}</span>
                  <span className="text-muted-foreground ml-auto whitespace-nowrap">{f.date(e.entryDate)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id}>
                        <td className={Number(l.credit) > 0 ? "py-0.5 pl-8" : "py-0.5"}>
                          <span className="text-muted-foreground mr-2 font-mono text-xs">{l.account.code}</span>
                          {l.account.name}
                          {l.partner && <span className="text-muted-foreground"> · {l.partner.name}</span>}
                        </td>
                        <td className="w-32 text-right tabular-nums">{Number(l.debit) > 0 ? f.money(l.debit) : ""}</td>
                        <td className="w-32 text-right tabular-nums">{Number(l.credit) > 0 ? f.money(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
        {query.data && query.data.total > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPage={setPage} />}
      </Card>
      {open && <ManualEntrySheet open={open} onOpenChange={setOpen} />}
    </div>
  );
}

type Row = { key: number; accountId: string; debit: string; credit: string };
let seq = 0;
const row = (): Row => ({ key: ++seq, accountId: "", debit: "", credit: "" });

function ManualEntrySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("finance.journal");
  const tc = useTranslations("common");
  const f = useFormat();
  const qc = useQueryClient();
  const accounts = (useAccounts().data ?? []).filter((a) => a.active);
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[]>([row(), row()]);
  const [saving, setSaving] = useState(false);
  const dr = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const cr = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0;
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit() {
    if (!balanced) return toast.error(t("unbalanced"));
    setSaving(true);
    try {
      await api("/finance/journals", {
        method: "POST",
        body: {
          entryDate: date,
          memo,
          lines: rows
            .filter((r) => r.accountId && (Number(r.debit) > 0 || Number(r.credit) > 0))
            .map((r) => ({ accountId: r.accountId, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 })),
        },
      });
      toast.success(t("posted"));
      await qc.invalidateQueries({ queryKey: ["finance"] });
      onOpenChange(false);
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t("new")}
        description={t("newHint")}
        closeLabel={tc("close")}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={submit} loading={saving} disabled={!balanced || memo.trim().length < 2}>
              {t("post")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field label={t("date")} htmlFor="j-date">
              <Input id="j-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("memo")} htmlFor="j-memo">
              <Input id="j-memo" value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-2">
            <div className="text-muted-foreground grid grid-cols-[1fr_110px_110px_32px] gap-2 text-xs font-medium">
              <span>{t("account")}</span>
              <span className="text-right">{t("debit")}</span>
              <span className="text-right">{t("credit")}</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_110px_110px_32px] gap-2">
                <NativeSelect value={r.accountId} onChange={(e) => set(r.key, { accountId: e.target.value })} aria-label={t("account")}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label={t("debit")}
                  className="text-right tabular-nums"
                  value={r.debit}
                  onChange={(e) => set(r.key, { debit: e.target.value, credit: e.target.value ? "" : r.credit })}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label={t("credit")}
                  className="text-right tabular-nums"
                  value={r.credit}
                  onChange={(e) => set(r.key, { credit: e.target.value, debit: e.target.value ? "" : r.debit })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tc("remove")}
                  disabled={rows.length <= 2}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setRows((rs) => [...rs, row()])}>
              <Plus /> {t("addLine")}
            </Button>
            <div className="grid grid-cols-[1fr_110px_110px_32px] gap-2 border-t pt-2 text-sm font-semibold">
              <span className={balanced ? "text-success" : "text-muted-foreground"}>
                {balanced ? t("balanced") : t("difference", { amount: f.money(Math.abs(dr - cr)) })}
              </span>
              <span className="text-right tabular-nums">{f.money(dr)}</span>
              <span className="text-right tabular-nums">{f.money(cr)}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
