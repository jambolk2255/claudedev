"use client";

import type { OnboardingData } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LayoutGrid, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyStep } from "@/components/onboarding/steps/company";
import { ModulesStep } from "@/components/onboarding/steps/modules";
import { STEP_FORM_ID } from "@/components/onboarding/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ME_KEY, useCan } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { handleFormError } from "@/lib/form-errors";

type Org = NonNullable<OnboardingData["company"]> & { mode: "simple" | "advanced"; modules: string[]; industry: string | null };

export function CompanySettings() {
  const t = useTranslations("settings.company");
  const tc = useTranslations("common");
  const can = useCan();
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["organization"], queryFn: () => api<Org>("/organization") });
  const [saving, setSaving] = useState(false);
  const editable = can("organization.manage");

  async function save(body: unknown) {
    setSaving(true);
    try {
      const updated = await api<Org>("/organization", { method: "PATCH", body });
      qc.setQueryData(["organization"], updated);
      await qc.invalidateQueries({ queryKey: ME_KEY });
      toast.success(t("saved"));
    } catch (err) {
      handleFormError(err);
    } finally {
      setSaving(false);
    }
  }

  const footer = editable && (
    <CardFooter className="bg-muted/30 justify-end">
      <Button type="submit" form={STEP_FORM_ID} loading={saving}>
        {!saving && <Save />} {tc("save")}
      </Button>
    </CardFooter>
  );

  return (
    <>
      <PageHeader level="section" title={t("title")} description={t("subtitle")} />
      {!org.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">
              <Building2 /> {t("profile")}
            </TabsTrigger>
            <TabsTrigger value="modules">
              <LayoutGrid /> {t("modules")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <Card>
              <CardContent className="pt-5">
                <fieldset disabled={!editable}>
                  <CompanyStep
                    data={{}}
                    initial={Object.fromEntries(Object.entries(org.data).map(([k, v]) => [k, v ?? ""])) as NonNullable<OnboardingData["company"]>}
                    onSubmit={(v) => save(v)}
                  />
                </fieldset>
              </CardContent>
              {footer}
            </Card>
          </TabsContent>
          <TabsContent value="modules">
            <Card>
              <CardContent className="pt-5">
                <ModulesStep
                  data={org.data.industry ? ({ industry: { industry: org.data.industry } } as OnboardingData) : {}}
                  initial={{ mode: org.data.mode, modules: org.data.modules as NonNullable<OnboardingData["modules"]>["modules"] }}
                  onSubmit={(v) => save(v)}
                />
              </CardContent>
              {footer}
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
