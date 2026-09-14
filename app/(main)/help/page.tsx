import { PageHeader } from "@/components/shared/page-header";
import { HelpFaqView } from "@/components/help/help-faq-view";
import { requireSession } from "@/lib/auth";
import { FAQ_SECTIONS } from "@/lib/faq";

export default async function HelpPage() {
  await requireSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Help & FAQ"
        description="Search common questions about roles, approvals, notifications, and the Sheet integration."
      />
      <HelpFaqView sections={FAQ_SECTIONS} />
    </div>
  );
}
