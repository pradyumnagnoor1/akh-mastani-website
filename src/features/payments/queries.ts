import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { collectPages } from "@/features/communication/pagination";
import type { Charge } from "./types";
export const paymentData = cache(async () => {
  const context = await requireMember();
  const charges = await collectPages((from, to) =>
    context.supabase
      .from("payment_charges")
      .select("*")
      .neq("status", "deleted")
      .order("id")
      .range(from, to),
  );
  return {
    ...context,
    charges: (charges as Charge[]).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  };
});
