import "server-only";
import { createECDH } from "node:crypto";
import { appOrigin, supabaseConfig } from "@/lib/config";
export function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const database = supabaseConfig();
  if (!publicKey || !privateKey || !subject || !secret || !database)
    return null;
  try {
    if (
      !/^[A-Za-z0-9_-]{87}$/.test(publicKey) ||
      !/^[A-Za-z0-9_-]{43}$/.test(privateKey)
    )
      return null;
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (curve.getPublicKey().toString("base64url") !== publicKey) return null;
    if (
      !/^mailto:[^\s@]+@[^\s@]+$/.test(subject) &&
      !subject.startsWith("https://")
    )
      return null;
    const origin = appOrigin();
    return { publicKey, privateKey, subject, secret, database, origin };
  } catch {
    return null;
  }
}
