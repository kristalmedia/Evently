import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAllUsers } from "@/lib/store";
import { LoginPanel } from "./login-panel";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const users = getAllUsers().filter((u) => u.verificationStatus === "VERIFIED");
  return <LoginPanel users={users} />;
}
