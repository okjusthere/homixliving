const INVITATION_TOKEN = /^[A-Za-z0-9_-]{24,80}$/;

/** Re-open the invitation endpoint so a different browser gets its own cookie. */
export function loginHandoffUrl(loginUrl: string) {
  const current = new URL(loginUrl);
  const token = current.searchParams.get("invitation");
  if (token && INVITATION_TOKEN.test(token)) {
    const invite = new URL(`/join/${token}`, current.origin);
    const lang = current.searchParams.get("lang");
    if (lang === "en" || lang === "zh") invite.searchParams.set("lang", lang);
    return invite.toString();
  }
  if (current.searchParams.get("apply") === "1") {
    const start = new URL("/join/start", current.origin);
    for (const key of ["source", "lang", "plan", "campaign"]) {
      const value = current.searchParams.get(key);
      if (value) start.searchParams.set(key, value);
    }
    return start.toString();
  }
  return current.toString();
}
