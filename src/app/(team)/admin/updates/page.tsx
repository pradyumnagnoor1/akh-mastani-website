import { ReleaseUpdates } from "@/components/release-updates";
import { adminUpdates } from "@/features/updates/queries";

export default async function AdminUpdatesPage() {
  const releases = await adminUpdates();
  return (
    <>
      <div className="page-heading">
        <h1>Admin Updates</h1>
        <p className="muted">Website changes for team management.</p>
      </div>
      <ReleaseUpdates releases={releases} />
    </>
  );
}
