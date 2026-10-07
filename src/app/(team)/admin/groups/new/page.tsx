import Link from "next/link";
import { communicationEditorData } from "@/features/communication/queries";
import { GroupForm } from "@/components/communication-forms";
export default async function NewGroup() {
  const { people } = await communicationEditorData();
  return (
    <>
      <div className="page-heading">
        <Link className="back-link" href="/admin/groups">
          ← Saved groups
        </Link>
        <h1>New group</h1>
      </div>
      <GroupForm id={crypto.randomUUID()} people={people} />
    </>
  );
}
