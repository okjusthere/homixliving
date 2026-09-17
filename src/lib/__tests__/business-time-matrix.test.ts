import { execFileSync } from "node:child_process";

// Separate processes catch server/browser host-zone dependencies, including
// module-level formatters. These tests use no database or network services.
for (const TZ of ["UTC", "America/New_York", "Asia/Shanghai", "America/Los_Angeles"]) {
  for (const file of ["db-time", "business-time", "reporting", "invoice-date"]) {
    execFileSync(process.execPath, ["--import", "tsx", `src/lib/__tests__/${file}.test.ts`], {
      env: { ...process.env, TZ }, stdio: "inherit",
    });
  }
}
