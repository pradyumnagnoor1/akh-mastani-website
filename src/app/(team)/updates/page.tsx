import { ReleaseUpdates } from "@/components/release-updates";
import { memberUpdates } from "@/features/updates/queries";

export default async function UpdatesPage() {
  const releases = await memberUpdates();
  return (
    <>
      <div className="page-heading">
        <h1>Updates</h1>
        <p className="muted">What’s new in your team website.</p>
      </div>
      <ReleaseUpdates releases={releases} />
    </>
  );
}
