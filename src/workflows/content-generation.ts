import {
  prepareGeneration,
  requestGeneration,
  saveGeneration,
  failGeneration,
  dispatchFollowingGeneration,
} from "@/lib/content/steps";
export async function contentGenerationWorkflow(id: string) {
  "use workflow";
  try {
    if (!(await prepareGeneration(id))) return;
    const result = await requestGeneration(id);
    if (result) await saveGeneration(id, result);
  } catch {
    await failGeneration(id);
  }
  await dispatchFollowingGeneration(id);
}
