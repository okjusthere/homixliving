"use client";

import { useParams } from "next/navigation";
import { RentalDealFormPage } from "../../new/page";

export default function EditRentalPage() {
  const params = useParams();
  return <RentalDealFormPage mode="edit" dealId={String(params.id)} />;
}
