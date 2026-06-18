"use client";

import Link from "next/link";
import { Btn } from "./primitives";
import { IconPlus } from "./icons";

export function DashboardCTA() {
  return (
    <Link href="/rental/new">
      <Btn variant="primary" size="lg" icon={<IconPlus />}>
        New Rental
      </Btn>
    </Link>
  );
}
