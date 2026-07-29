import { findUserByInvitationToken } from "@/lib/store";
import { SetPasswordPanel } from "./set-password-panel";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = token ? findUserByInvitationToken(token) : null;
  return (
    <SetPasswordPanel
      token={token ?? null}
      user={
        user
          ? { id: user.id, fullName: user.fullName, email: user.email }
          : null
      }
    />
  );
}
