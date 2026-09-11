import { requireActiveAgent } from "@/lib/auth-guards";
import { EmailWorkspace } from "@/components/content/email-workspace";
import "@/app/content/studio.css";
export const metadata = { title: "Email Marketing · Homix" };
export default async function Page() {
  await requireActiveAgent();
  return <EmailWorkspace />;
}
