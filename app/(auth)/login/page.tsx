import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAllUsers } from "@/lib/store";
import { TEST_LOGIN_ENABLED } from "@/lib/test-login";
import { LoginPanel } from "./login-panel";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  // When test login is disabled, don't pre-render the seeded user list into
  // the HTML — the panel won't show it anyway and there's no reason to leak
  // employee names and roles on a public sign-in page.
  const users = TEST_LOGIN_ENABLED
    ? getAllUsers().filter((u) => u.verificationStatus === "VERIFIED")
    : [];
  return <LoginPanel users={users} />;
}
