import { requireActiveAgent } from "@/lib/auth-guards";
import { ContentStudio } from "@/components/content/studio";
export const metadata = { title: "Content Studio · Homix" };
export default async function Page() {
  await requireActiveAgent();
  return <ContentStudio />;
}
