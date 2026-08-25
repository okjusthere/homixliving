import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Team compensation · Homix" };

export default async function TeamCompensationPage() {
  redirect("/team-workspace");
}
