import { prepareOpenHouseJob } from "@/lib/content/open-house-step";
export async function companyOpenHouseWorkflow(id: string) {
  "use workflow";
  await prepareOpenHouseJob(id);
}
