import { getTranslations } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
