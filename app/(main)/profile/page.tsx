import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatDateTime, initials } from "@/lib/utils";

export default async function ProfilePage() {
  const { user } = await requireSession();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Your profile" />

      <Card>
        <CardHeader>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="bg-accent/15 text-accent text-lg">
                {initials(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2 min-w-0">
              <CardTitle className="text-xl break-words">{user.fullName}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="signal">{ROLE_LABEL[user.role]}</Badge>
                <Badge variant="outline">{user.department}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-6 border-t">
          <ProfileRow label="Microsoft email" value={user.email} mono />
          <ProfileRow label="Department" value={user.department} />
          <ProfileRow label="Job title" value={user.jobTitle ?? "—"} />
          <ProfileRow label="Status" value={user.status === "active" ? "Active" : "Disabled"} />
          <ProfileRow
            label="Last login"
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
            mono
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 py-1">
      <div className="callsign">{label}</div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
