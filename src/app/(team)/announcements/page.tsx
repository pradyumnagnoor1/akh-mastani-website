import { CommunicationList } from "@/components/communication-pages";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <CommunicationList kind="announcement" view={view} />;
}
