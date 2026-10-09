"use client";
import { useState } from "react";
import { expirationDate } from "@/features/expiration/policy";
export function ExpirationField({ expiresAt }: { expiresAt?: string | null }) {
  const [date, setDate] = useState(expirationDate(expiresAt));
  return (
    <>
      <label htmlFor="expiration-date">Expiration date (optional)</label>
      <input
        id="expiration-date"
        name="expiration_date"
        type="date"
        max="2100-12-31"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <p className="muted small">
        Available through this date in Texas time, then permanently deleted with
        its history. Leave blank to keep it until you delete it.
      </p>
    </>
  );
}
