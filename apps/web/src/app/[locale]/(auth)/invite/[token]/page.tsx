import { getTranslations } from "next-intl/server";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.invite");
  return { title: t("title") };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInviteForm token={token} />;
}
