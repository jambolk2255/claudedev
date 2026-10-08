import { redirect } from "@/i18n/navigation";

export default async function ContactsIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/contacts/customers", locale });
}
