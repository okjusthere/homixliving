"use client";

import { useParams } from "next/navigation";
import { RentalDealFormPage } from "../../rental-deal-form";

export default function EditRentalPage() {
  const params = useParams();
  return <RentalDealFormPage mode="edit" dealId={String(params.id)} />;
}
