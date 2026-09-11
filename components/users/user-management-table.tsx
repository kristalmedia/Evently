"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatDate, initials } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";
import type { Department, Role, User } from "@/lib/types";

const DEPARTMENTS: Department[] = [
  "Sales",
  "Finance",
  "Technical",
  "IT",
  "CCM",
  "HR",
  "General Manager",
  "Unassigned",
];

const ROLES: Role[] = [
  "SUPER_ADMIN",
  "SALES_ADMIN",
  "CCM_ADMIN",
  "MANAGER",
  "FINANCE_LEAD",
  "FINANCIAL_ADMIN",
  "HR",
  "VIEWER",
];

export function UserManagementTable({ initialUsers }: { initialUsers: User[] }) {
  const currentUser = useSessionStore((s) => s.user);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<
    | {
        url: string;
        email: string;
        emailStatus?: {
          delivered?: boolean;
          simulated?: boolean;
          error?: string;
        };
      }
    | null
  >(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("VIEWER");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.department.toLowerCase().includes(query)
    );
  }, [q, users]);

  const invitedCount = users.filter((u) => u.verificationStatus === "INVITED").length;
  const verifiedCount = users.filter((u) => u.verificationStatus === "VERIFIED").length;

  async function handleAddUser(input: {
    fullName: string;
    email: string;
    department: Department;
    role: Role;
    jobTitle?: string;
  }) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Could not add user");
      return;
    }
    const { user, invitationUrl, emailDispatched } = await res.json();
    setUsers((list) => [user, ...list.filter((u) => u.id !== user.id)]);
    if (invitationUrl) setInviteLink({ url: invitationUrl, email: user.email, emailStatus: emailDispatched });
    setAddOpen(false);
    // Honest toast: reflect what actually happened.
    if (emailDispatched?.delivered) {
      toast.success(`✉ Invitation email delivered to ${emailDispatched.to}`, {
        position: "bottom-center",
      });
    } else if (emailDispatched?.simulated) {
      toast.warning(
        `User created. Email transport not configured — copy the invitation link.`,
        { position: "bottom-center" }
      );
    } else {
      toast.error(
        `User created but email failed: ${emailDispatched?.error ?? "unknown error"}. Copy the link.`,
        { position: "bottom-center" }
      );
    }
  }

  async function handleResend(userId: string) {
    const res = await fetch(`/api/users/invite/resend?id=${userId}`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Could not resend invite");
      return;
    }
    const { user, invitationUrl, emailDispatched } = await res.json();
    setUsers((list) => list.map((u) => (u.id === user.id ? user : u)));
    setInviteLink({ url: invitationUrl, email: user.email, emailStatus: emailDispatched });
    if (emailDispatched?.delivered) {
      toast.success(`✉ Reminder delivered to ${emailDispatched.to}`, {
        position: "bottom-center",
      });
    } else if (emailDispatched?.simulated) {
      toast.warning(
        "New invitation link generated. Email transport not configured — copy the link.",
        { position: "bottom-center" }
      );
    } else {
      toast.error(
        `Link generated but email failed: ${emailDispatched?.error ?? "unknown error"}.`,
        { position: "bottom-center" }
      );
    }
  }

  function startEdit(u: User) {
    setEditing(u.id);
    setEditName(u.fullName);
    setEditRole(u.role);
  }

  function cancelEdit() {
    setEditing(null);
    setEditName("");
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/users?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
      setUsers((list) => list.filter((u) => u.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.fullName}`, {
        position: "bottom-center",
      });
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    if (trimmed.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: trimmed, role: editRole }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Could not save");
      return;
    }
    const { user } = await res.json();
    setUsers((list) => list.map((u) => (u.id === user.id ? user : u)));
    cancelEdit();
    toast.success(`Updated ${user.fullName}`);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, department…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3 text-xs callsign">
            <span>
              {verifiedCount} verified · {invitedCount} invited
            </span>
          </div>
          <Button variant="accent" className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add new user
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const isEditing = editing === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-accent/15 text-accent text-[0.65rem]">
                            {initials(u.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(u.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            className="max-w-[240px]"
                          />
                        ) : (
                          <div>
                            <div className="font-medium">{u.fullName}</div>
                            {u.jobTitle && (
                              <div className="text-xs text-muted-foreground">
                                {u.jobTitle}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {u.department}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Select
                          value={editRole}
                          onValueChange={(v) => setEditRole(v as Role)}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={u.role === "SUPER_ADMIN" ? "amber" : "signal"}>
                          {ROLE_LABEL[u.role]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm font-mono text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge user={u} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="accent"
                              size="sm"
                              className="gap-1"
                              onClick={() => saveEdit(u.id)}
                            >
                              <Save className="h-3 w-3" />
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEdit}
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(u)}
                              title="Edit name and role (Super Admin only)"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {u.verificationStatus === "INVITED" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleResend(u.id)}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Resend
                              </Button>
                            )}
                            {/* Delete — Super Admin only, cannot delete self */}
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={currentUser?.id === u.id}
                              onClick={() => setDeleteTarget(u)}
                              title={
                                currentUser?.id === u.id
                                  ? "You cannot delete your own account"
                                  : "Delete user"
                              }
                            >
                              <Trash2
                                className={`h-3.5 w-3.5 ${
                                  currentUser?.id === u.id
                                    ? "text-muted-foreground/40"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                              />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No users match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAddUser} />
      <InviteLinkDialog data={inviteLink} onClose={() => setInviteLink(null)} />

      {/* Delete confirmation modal */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && !deleteBusy && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              Delete user account
            </DialogTitle>
            <DialogDescription>
              This will permanently remove{" "}
              <span className="font-medium">{deleteTarget?.fullName}</span> (
              <span className="font-mono text-xs">{deleteTarget?.email}</span>).
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget?.role === "SUPER_ADMIN" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <span className="font-medium">Warning:</span> This is a Super Admin
              account. Make sure other Super Admins remain who can manage the
              system.
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteBusy}
              onClick={doDelete}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              {deleteBusy ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ user }: { user: User }) {
  if (user.status === "disabled") {
    return <Badge variant="muted">Disabled</Badge>;
  }
  if (user.verificationStatus === "INVITED") {
    return (
      <Badge variant="amber" className="gap-1">
        <Mail className="h-3 w-3" />
        Invited
      </Badge>
    );
  }
  return (
    <Badge variant="emerald" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Verified User
    </Badge>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: {
    fullName: string;
    email: string;
    department: Department;
    role: Role;
    jobTitle?: string;
  }) => Promise<void> | void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState<Department>("Sales");
  const [role, setRole] = useState<Role>("VIEWER");
  const [jobTitle, setJobTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName("");
    setEmail("");
    setDepartment("Sales");
    setRole("VIEWER");
    setJobTitle("");
  }

  async function submit() {
    if (!fullName || !email) {
      toast.error("Name and email are required");
      return;
    }
    setSubmitting(true);
    await onSubmit({ fullName, email, department, role, jobTitle: jobTitle || undefined });
    setSubmitting(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
          <DialogDescription>
            The user will be marked <span className="font-medium">Invited</span> until
            they visit their invitation link and set a password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-fullname">Full name</Label>
            <Input
              id="new-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aiman Bahar"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Kristal Media email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="firstname.lastname@kristal.media"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-title">Job title (optional)</Label>
            <Input
              id="new-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={submitting} onClick={submit} className="gap-1">
            <ShieldCheck className="h-4 w-4" />
            {submitting ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteLinkDialog({
  data,
  onClose,
}: {
  data: {
    url: string;
    email: string;
    emailStatus?: { delivered?: boolean; simulated?: boolean; error?: string };
  } | null;
  onClose: () => void;
}) {
  function copy() {
    if (!data) return;
    navigator.clipboard.writeText(data.url);
    toast.success("Copied to clipboard");
  }

  const delivered = data?.emailStatus?.delivered === true;
  const simulated = data?.emailStatus?.simulated === true;

  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail
              className={`h-4 w-4 ${
                delivered
                  ? "text-emerald-600 dark:text-emerald-400"
                  : simulated
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
              }`}
            />
            {delivered
              ? "Invitation email delivered"
              : simulated
                ? "User created — email not sent"
                : "User created — email failed"}
          </DialogTitle>
          <DialogDescription>
            {delivered ? (
              <>
                An activation email has been delivered to{" "}
                <span className="font-mono font-medium">{data?.email}</span>.
              </>
            ) : simulated ? (
              <>
                SMTP transport isn't configured, so no email was actually sent
                to <span className="font-mono font-medium">{data?.email}</span>.
                Copy the link below and share it manually, or configure
                <code className="mx-1 rounded bg-muted px-1 text-[0.7rem]">.env.local</code>
                and try again.
              </>
            ) : (
              <>
                Delivery failed for{" "}
                <span className="font-mono font-medium">{data?.email}</span>:{" "}
                <span className="text-rose-600 dark:text-rose-400">
                  {data?.emailStatus?.error ?? "unknown error"}
                </span>
                . Copy the link and send it manually.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {data && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
              {data.url}
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={copy}>
              <Copy className="h-4 w-4" />
              Copy link
            </Button>
            {simulated && (
              <p className="text-[0.7rem] text-muted-foreground">
                Required env vars: <code>EMAIL_SMTP_HOST</code>,{" "}
                <code>EMAIL_SMTP_PORT</code>, <code>EMAIL_SMTP_USER</code>,{" "}
                <code>EMAIL_SMTP_PASS</code>, <code>EMAIL_FROM</code>. See{" "}
                <code>.env.local.example</code>.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
