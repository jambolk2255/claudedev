"use client";

import type { Paginated } from "@stockflow/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MailPlus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";

interface UserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  role: { id: string; key: string | null; name: string };
}
interface RoleRow {
  id: string;
  key: string | null;
  name: string;
}
interface InviteRow {
  id: string;
  email: string;
  expiresAt: string;
  role: { id: string; name: string };
}

function InviteDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (v: boolean) => void; roles: RoleRow[] }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { data: me } = useMe();
  const choices = roles.filter((r) => r.key !== "owner" || me?.role.key === "owner");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api<{ inviteUrl: string }>("/users/invitations", { method: "POST", body: { email, roleId: roleId || choices.find((r) => r.key === "viewer")?.id } }),
    onSuccess: (res) => {
      setLink(res.inviteUrl);
      void qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (err) => handleFormError(err),
  });

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(() => (setLink(null), setEmail(""), setRoleId("")), 200);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteBody")}</DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait">
          {link ? (
            <motion.div key="link" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="grid gap-3">
              <p className="text-sm">{t("linkReady")}</p>
              <div className="flex gap-2">
                <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button onClick={() => navigator.clipboard.writeText(link).then(() => toast.success(t("copied")))}>
                  <Copy /> {t("copy")}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("linkNote")}</p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <Field label={t("email")} htmlFor="invite-email">
                <Input id="invite-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t("role")} htmlFor="invite-role">
                <NativeSelect id="invite-role" value={roleId || choices.find((r) => r.key === "viewer")?.id} onChange={(e) => setRoleId(e.target.value)}>
                  {choices.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <DialogFooter>
                <Button type="submit" loading={invite.isPending}>
                  {!invite.isPending && <MailPlus />} {t("send")}
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export function UsersSettings() {
  const t = useTranslations("settings.users");
  const format = useFormatter();
  const can = useCan();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [inviteOpen, setInviteOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("invite") === "1") setInviteOpen(true);
  }, []);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<Paginated<UserRow>>("/users?pageSize=100") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<RoleRow[]>("/roles"), enabled: can("roles.view") });
  const invites = useQuery({ queryKey: ["invitations"], queryFn: () => api<InviteRow[]>("/users/invitations") });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { roleId?: string; active?: boolean } }) => api<UserRow>(`/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success(t("updated"));
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => handleFormError(err),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/users/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["invitations"] }),
    onError: (err) => handleFormError(err),
  });

  const manage = can("users.manage");

  return (
    <>
      <PageHeader
        level="section"
        title={t("title")}
        description={t("subtitle")}
        actions={
          can("users.invite") && (
            <Button onClick={() => setInviteOpen(true)} disabled={!roles.data}>
              <UserPlus /> {t("invite")}
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t("columns.user")}</TH>
              <TH>{t("columns.role")}</TH>
              <TH>{t("columns.lastLogin")}</TH>
              <TH className="text-right">{t("columns.active")}</TH>
            </TR>
          </THead>
          <TBody>
            {users.isPending
              ? [0, 1, 2].map((i) => (
                  <TR key={i}>
                    <TD colSpan={4}>
                      <Skeleton className="h-8" />
                    </TD>
                  </TR>
                ))
              : users.data?.items.map((u, i) => {
                  const self = u.id === me?.id;
                  const ownerLocked = u.role.key === "owner" && me?.role.key !== "owner";
                  return (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-muted/50 border-b transition-colors"
                    >
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="grid">
                            <span className="flex items-center gap-1.5 font-medium">
                              {u.name} {self && <Badge variant="secondary">{t("you")}</Badge>}
                              {u.twoFactorEnabled && <ShieldCheck className="text-success size-3.5" aria-label="2FA" />}
                            </span>
                            <span className="text-muted-foreground text-xs">{u.email}</span>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        {manage && !self && !ownerLocked && roles.data ? (
                          <NativeSelect
                            className="h-8 w-44"
                            value={u.role.id}
                            onChange={(e) => update.mutate({ id: u.id, body: { roleId: e.target.value } })}
                            aria-label={t("columns.role")}
                          >
                            {roles.data
                              .filter((r) => r.key !== "owner" || me?.role.key === "owner")
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                          </NativeSelect>
                        ) : (
                          <Badge variant={u.role.key === "owner" ? "default" : "secondary"}>{u.role.name}</Badge>
                        )}
                      </TD>
                      <TD className="text-muted-foreground text-sm">{u.lastLoginAt ? format.relativeTime(new Date(u.lastLoginAt)) : t("never")}</TD>
                      <TD className="text-right">
                        <Switch
                          checked={u.active}
                          disabled={!manage || self || ownerLocked}
                          onCheckedChange={(v) => update.mutate({ id: u.id, body: { active: v } })}
                          aria-label={t("columns.active")}
                        />
                      </TD>
                    </motion.tr>
                  );
                })}
          </TBody>
        </Table>
      </Card>

      {!!invites.data?.length && (
        <div className="mt-8 grid gap-3">
          <h2 className="text-sm font-semibold">{t("pending")}</h2>
          <AnimatePresence initial={false}>
            {invites.data.map((inv) => (
              <motion.div key={inv.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="flex items-center gap-3 p-3">
                  <MailPlus className="text-muted-foreground size-4" />
                  <span className="flex-1 truncate text-sm">{inv.email}</span>
                  <Badge variant="outline">{inv.role.name}</Badge>
                  <span className="text-muted-foreground hidden text-xs sm:inline">{t("expires", { when: format.relativeTime(new Date(inv.expiresAt)) })}</span>
                  {can("users.invite") && (
                    <Button variant="ghost" size="icon" onClick={() => revoke.mutate(inv.id)} aria-label={t("revoke")}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {roles.data && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles.data} />}
    </>
  );
}
