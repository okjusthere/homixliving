export function configuredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string): boolean {
  return configuredAdminEmails().includes(email.trim().toLowerCase());
}
