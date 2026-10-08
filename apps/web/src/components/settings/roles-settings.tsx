"use client";

import { PERMISSION_GROUPS, type Permission, type PermissionGroup } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

interface RoleRow {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  _count: { users: number };
}

export function RolesSettings() {
  const t = useTranslations("settings.roles");
  const tp = useTranslations("permissions");
  const tr = useTranslations("roles");
  const tc = useTranslations("common");
  const can = useCan();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<RoleRow[]>("/roles") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<Permission>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions));
  }, [selected]);

  const editable = can("roles.manage") && selected?.key !== "owner";
  const dirty = selected && (draft.size !== selected.permissions.length || selected.permissions.some((p) => !draft.has(p)));

  const save = useMutation({
    mutationFn: () =>
      api(`/roles/${selected!.id}`, {
        method: "PATCH",
        body: { name: selected!.name, description: selected!.description ?? undefined, permissions: [...draft] },
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => handleFormError(err),
  });
  const create = useMutation({
    mutationFn: () => api<RoleRow>("/roles", { method: "POST", body: { name: newName, permissions: ["products.view", "inventory.view"] } }),
    onSuccess: (role) => {
      setCreateOpen(false);
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["roles"] }).then(() => setSelectedId(role.id));
    },
    onError: (err) => handleFormError(err),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => handleFormError(err),
  });

  function toggle(p: Permission, on: boolean) {
    setDraft((d) => {
      const next = new Set(d);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });
  }

  const roleName = (r: RoleRow) => (r.isSystem && r.key ? tr(`${r.key}.name`) : r.name);

  return (
    <>
      <PageHeader
        level="section"
        title={t("title")}
        description={t("subtitle")}
        actions={
          can("roles.manage") && (
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus /> {t("create")}
            </Button>
          )
        }
      />
      {!roles.data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-4">
          <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1.5">
            {roles.data.map((r) => {
              const active = r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                    active ? "border-primary bg-primary/10 text-primary font-medium" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {roleName(r)}
                  <span className={cn("text-xs tabular-nums", active ? "text-primary/70" : "text-muted-foreground/70")}>{r._count.users}</span>
                </button>
              );
            })}
          </div>

          {selected && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4 border-b pb-4">
                <div className="grid gap-1">
                  <CardTitle className="flex items-center gap-2">
                    {roleName(selected)}
                    {selected.isSystem && <Badge variant="secondary">{t("system")}</Badge>}
                    {selected.key === "owner" && (
                      <Badge variant="outline">
                        <Lock /> {t("locked")}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{selected.isSystem && selected.key ? tr(`${selected.key}.description`) : selected.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {!selected.isSystem && can("roles.manage") && (
                    <Button variant="ghost" size="icon" onClick={() => remove.mutate(selected.id)} aria-label={tc("delete")}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                  {editable && (
                    <Button size="sm" onClick={() => save.mutate()} disabled={!dirty} loading={save.isPending}>
                      {!save.isPending && <Save />} {tc("save")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <div className="divide-y">
                {(Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).map((group) => {
                  const perms = PERMISSION_GROUPS[group] as readonly Permission[];
                  const count = perms.filter((p) => draft.has(p)).length;
                  const all = count === perms.length;
                  return (
                    <div key={group} className="grid gap-2 px-5 py-3 sm:grid-cols-[180px_1fr] sm:items-center">
                      <label className="flex items-center gap-2.5 text-sm font-medium">
                        <Checkbox
                          checked={all ? true : count > 0 ? "indeterminate" : false}
                          disabled={!editable}
                          onCheckedChange={() => perms.forEach((p) => toggle(p, !all))}
                        />
                        {tp(`groups.${group}`)}
                        <span className="text-muted-foreground text-xs font-normal tabular-nums">
                          {count}/{perms.length}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-1.5 pl-7 sm:pl-0">
                        {perms.map((p) => {
                          const on = draft.has(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              disabled={!editable}
                              aria-pressed={on}
                              onClick={() => toggle(p, !on)}
                              className={cn(
                                "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                                on ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground bg-card",
                              )}
                            >
                              {tp(`actions.${p.split(".")[1]}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label={t("name")} htmlFor="role-name">
              <Input id="role-name" required minLength={2} maxLength={60} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="submit" loading={create.isPending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
