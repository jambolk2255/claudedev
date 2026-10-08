import { getTranslations } from "next-intl/server";
import { PublicTracking } from "@/components/commerce/public-tracking";

export async function generateMetadata() {
  const t = await getTranslations("commerce.track");
  return { title: t("title"), robots: { index: false } };
}

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicTracking token={token} />;
}
