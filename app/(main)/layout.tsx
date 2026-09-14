import { redirect } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SessionHydrator } from "@/components/auth/session-hydrator";
import { BroadcastToastPoller } from "@/components/layout/broadcast-toast-poller";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <TooltipProvider delayDuration={200}>
      <SessionHydrator user={session.user} />
      <BroadcastToastPoller />
      <OnboardingModal />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-3 sm:p-4 md:p-8 min-w-0">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
