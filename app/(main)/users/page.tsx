import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { UserManagementTable } from "@/components/users/user-management-table";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getAllUsers } from "@/lib/store";

export default async function UsersPage() {
  const { user } = await requireSession();
  if (!can(user, "users.manage")) redirect("/dashboard");

  const users = getAllUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IT Administration"
        title="User management"
        description="All Kristal Media staff with system access. Add new users to invite them via email — they'll appear as Invited until they set up their password."
      />
      <UserManagementTable initialUsers={users} />
    </div>
  );
}
