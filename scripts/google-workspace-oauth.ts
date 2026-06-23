import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { loadEnvConfig } from "@next/env";
import { google } from "googleapis";

loadEnvConfig(process.cwd());

const DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const ENV_PATH = ".env.local";

function setEnvValue(key: string, value: string) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, "m");

  if (matcher.test(text)) {
    text = text.replace(matcher, line);
  } else {
    text = text.replace(/\s*$/, "\n") + line + "\n";
  }

  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

function openUrl(url: string) {
  execFile("open", [url], (error) => {
    if (error) {
      console.log("Open this URL in your browser:");
      console.log(url);
    }
  });
}

async function main() {
  const clientId = process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_WORKSPACE_OAUTH_CLIENT_ID and GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET in .env.local first."
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");

  const server = http.createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local OAuth callback server.");
  }

  const redirectUri = `http://127.0.0.1:${address.port}`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [DIRECTORY_SCOPE],
    state,
  });

  console.log(`Waiting for Google OAuth callback on ${redirectUri}`);
  console.log("Authorize Google Workspace here:");
  console.log(authUrl);
  openUrl(authUrl);

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Google OAuth callback."));
    }, 5 * 60 * 1000);

    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url || "/", redirectUri);
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          throw new Error(`Google OAuth error: ${error}`);
        }

        if (returnedState !== state) {
          throw new Error("Google OAuth state mismatch.");
        }

        const authCode = url.searchParams.get("code");
        if (!authCode) {
          throw new Error("Google OAuth callback did not include a code.");
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<p>Google Workspace authorization complete. You can close this tab.</p>");
        clearTimeout(timeout);
        server.close();
        resolve(authCode);
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<p>Google Workspace authorization failed. Return to the terminal.</p>");
        clearTimeout(timeout);
        server.close();
        reject(error);
      }
    });
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Re-run this script and approve the consent prompt with the Super Admin account."
    );
  }

  setEnvValue("GOOGLE_WORKSPACE_AUTH_MODE", "oauth");
  setEnvValue("GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN", tokens.refresh_token);

  console.log("GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN written to .env.local; value redacted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
