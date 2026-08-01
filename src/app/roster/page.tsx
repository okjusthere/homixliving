import { redirect } from "next/navigation";

// Keep old bookmarks working while account and public-roster administration
// live together in the unified agents console.
export default function RosterPage() {
  redirect("/agents?view=public");
}
