import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
const path = ".env.local";
let contents = "";
try {
  contents = readFileSync(path, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const read = (key) =>
  contents
    .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2");
const existingPublic = read("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  existingPrivate = read("VAPID_PRIVATE_KEY");
if (Boolean(existingPublic) !== Boolean(existingPrivate))
  throw new Error(
    "Both VAPID keys must be present together. Restore the missing key instead of rotating it.",
  );
const values = existingPublic
  ? {}
  : (() => {
      const pair = webpush.generateVAPIDKeys();
      return {
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: pair.publicKey,
        VAPID_PRIVATE_KEY: pair.privateKey,
      };
    })();
if (!read("VAPID_SUBJECT"))
  values.VAPID_SUBJECT = "mailto:pradyumnagnoor@tamu.edu";
if (!read("CRON_SECRET"))
  values.CRON_SECRET = randomBytes(32).toString("base64url");
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${key}=${value}`)
    : contents + `${contents.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
}
writeFileSync(path, contents, { mode: 0o600 });
chmodSync(path, 0o600);
console.log(
  `Push credentials saved to ${path}. Keep this file private. Copy the four notification variables to your Vercel production environment and redeploy. Existing VAPID keys were preserved.`,
);
