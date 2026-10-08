"use client";

import { PERMISSION_GROUPS, type Permission, type PermissionGroup } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, Plus, Save, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="grid content-start gap-1.5">
            {roles.data.map((r) => {
              const active = r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm"
                >
                  {active && (
                    <motion.span
                      layoutId="role-active"
                      className="bg-card absolute inset-0 rounded-xl border shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                  <KeyRound className={cn("relative size-4", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="relative flex-1 font-medium">{roleName(r)}</span>
                  <Badge variant="outline" className="relative">
                    {r._count.users}
                  </Badge>
                </button>
              );
            })}
          </div>

          {selected && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
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
                    <Button onClick={() => save.mutate()} disabled={!dirty} loading={save.isPending}>
                      {!save.isPending && <Save />} {tc("save")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).map((group) => {
                  const perms = PERMISSION_GROUPS[group] as readonly Permission[];
                  const count = perms.filter((p) => draft.has(p)).length;
                  const all = count === perms.length;
                  return (
                    <div key={group} className="rounded-xl border p-3">
                      <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <Checkbox
                          checked={all ? true : count > 0 ? "indeterminate" : false}
                          disabled={!editable}
                          onCheckedChange={() => perms.forEach((p) => toggle(p, !all))}
                        />
                        {tp(`groups.${group}`)}
                        <span className="text-muted-foreground text-xs font-normal">
                          {count}/{perms.length}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 pl-7">
                        {perms.map((p) => (
                          <label key={p} className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Checkbox checked={draft.has(p)} disabled={!editable} onCheckedChange={(v) => toggle(p, v === true)} />
                            {tp(`actions.${p.split(".")[1]}`)}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
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
