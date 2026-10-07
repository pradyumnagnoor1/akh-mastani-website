import Link from "next/link";
import { notFound } from "next/navigation";
import { communicationEditorData } from "@/features/communication/queries";
import { GroupForm } from "@/components/communication-forms";
export default async function EditGroup({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { people, groups, groupMembers } = await communicationEditorData();
  const group = groups.find((g) => g.id === id && !g.archived_at);
  if (!group) notFound();
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href="/admin/groups">
          ← Saved groups
        </Link>
        <h1>
          Edit group<span className="accent">.</span>
        </h1>
      </div>
      <GroupForm
        id={id}
        group={group}
        people={people}
        assigned={groupMembers
          .filter((m) => m.group_id === id)
          .map((m) => m.member_id)}
      />
    </>
  );
}
