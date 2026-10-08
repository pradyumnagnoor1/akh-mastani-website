import { requireMember } from "@/features/identity/session";
import { AppShell } from "@/components/app-shell";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member } = await requireMember();
  return <AppShell member={member}>{children}</AppShell>;
}
