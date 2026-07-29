import { requireSession } from "@/lib/auth";
import { getNotifications } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationsView } from "@/components/notifications/notifications-view";

export default async function NotificationsPage() {
  const { user } = await requireSession();
  const list = getNotifications(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Auto-dispatched when events are created, updated, submitted, approved, or denied. Approval requests carry interactive Approve / Deny buttons."
      />
      <NotificationsView notifications={list} />
    </div>
  );
}
