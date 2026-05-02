import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import { join } from "path";
import { requireAdminApi } from "@/lib/auth-guards";

export async function POST(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const filePath = join(process.cwd(), "src/db/buildings-raw.json");
  writeFileSync(filePath, JSON.stringify(body, null, 2), "utf-8");
  return new NextResponse(JSON.stringify({ success: true, path: filePath }), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
