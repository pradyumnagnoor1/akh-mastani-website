import { CommunicationEditor } from "@/components/communication-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CommunicationEditor kind="announcement" id={id} />;
}
