"use client";

import Link from "next/link";
import { Btn } from "./primitives";
import { IconPlus } from "./icons";

export function DashboardCTA() {
  return (
    <Link href="/deals/new">
      <Btn variant="primary" size="lg" icon={<IconPlus />}>
        New Deal
      </Btn>
    </Link>
  );
}
