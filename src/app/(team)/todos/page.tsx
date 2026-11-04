import { CommunicationList } from "@/components/communication-pages";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; priority?: string }>;
}) {
  const { view, priority } = await searchParams;
  return <CommunicationList kind="task" view={view} priority={priority} />;
}
