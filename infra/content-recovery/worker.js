const RECOVERY_URL = "https://agents.homixny.com/api/cron/content-generations";

const worker = {
  async scheduled(_event, env) {
    if (!env.CONTENT_RECOVERY_SECRET) throw new Error("Recovery secret is missing");
    const response = await fetch(RECOVERY_URL, {
      headers: { Authorization: `Bearer ${env.CONTENT_RECOVERY_SECRET}` },
      redirect: "error",
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error(`Content recovery HTTP ${response.status}`);
    const result = await response.json();
    if (!Number.isInteger(result.dispatched) || result.dispatched < 0)
      throw new Error("Unexpected recovery response");
    console.log(JSON.stringify({ event: "content-recovery", dispatched: result.dispatched }));
  },
};
export default worker;
