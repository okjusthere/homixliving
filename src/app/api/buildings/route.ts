import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { buildings, type NewBuilding } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireActiveAgentApi, requireAdminApi } from "@/lib/auth-guards";

const submissionTypes = new Set(["email", "system_upload", "both"]);

type BuildingPayload = Pick<
  NewBuilding,
  | "region"
  | "name"
  | "managementCompany"
  | "submissionType"
  | "submissionNotes"
  | "invoiceNumberFormat"
  | "billToCompany"
  | "billToAddress"
  | "contactEmail"
  | "specialNotes"
  | "isOutOfState"
>;

const textOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const requiredText = (value: unknown) => textOrNull(value);

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

function cleanBuildingPayload(
  body: unknown
): { data: BuildingPayload } | { error: NextResponse } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: badRequest("Invalid building payload") };
  }

  const record = body as Record<string, unknown>;
  const name = requiredText(record.name);
  const region = requiredText(record.region);

  if (!name || !region) {
    return { error: badRequest("Name and region are required") };
  }

  const submissionType = textOrNull(record.submissionType) || "email";
  if (!submissionTypes.has(submissionType)) {
    return { error: badRequest("Invalid submission type") };
  }

  return {
    data: {
      name,
      region,
      submissionType,
      managementCompany: textOrNull(record.managementCompany),
      submissionNotes: textOrNull(record.submissionNotes),
      invoiceNumberFormat: textOrNull(record.invoiceNumberFormat),
      billToCompany: textOrNull(record.billToCompany),
      billToAddress: textOrNull(record.billToAddress),
      contactEmail: textOrNull(record.contactEmail),
      specialNotes: textOrNull(record.specialNotes),
      isOutOfState: record.isOutOfState === true,
    },
  };
}

function parseId(value: unknown) {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET() {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const allBuildings = await db.select().from(buildings).orderBy(buildings.region, buildings.name);
  return NextResponse.json(allBuildings);
}

export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const cleaned = cleanBuildingPayload(body);
  if ("error" in cleaned) return cleaned.error;

  const result = await db.insert(buildings).values(cleaned.data).returning();
  return NextResponse.json(result[0], { status: 201 });
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const id = parseId((body as Record<string, unknown>)?.id);
  if (!id) return badRequest("Building id is required");

  const cleaned = cleanBuildingPayload(body);
  if ("error" in cleaned) return cleaned.error;

  const result = await db
    .update(buildings)
    .set({ ...cleaned.data, updatedAt: new Date().toISOString() })
    .where(eq(buildings.id, id))
    .returning();
  return NextResponse.json(result[0]);
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdminApi();
  if ("error" in authResult) return authResult.error;

  const { id } = await req.json();
  const buildingId = parseId(id);
  if (!buildingId) return badRequest("Building id is required");

  await db.delete(buildings).where(eq(buildings.id, buildingId));
  return NextResponse.json({ success: true });
}
