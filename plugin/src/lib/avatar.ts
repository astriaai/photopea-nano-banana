// Ported from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/avatar.ts (commit ffe30c1b).
// Initials avatar matching astria.ai's header (sdbooth ApplicationHelper):
// the same palette and the same hash, so a user sees the same colour in the
// web app and in the plugin.
export const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

/** `email.downcase.each_codepoint.sum % USER_AVATAR_COLORS.size` from ApplicationHelper#user_avatar_color. */
export function avatarColor(email: string): string {
  let sum = 0;
  for (const char of email.toLowerCase()) sum += char.codePointAt(0) ?? 0;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

/** First letter of the first name, else of the email — what astria's layout shows. */
export function avatarInitial(name: string | undefined, email: string): string {
  const first = (name || "").trim().split(/\s+/)[0] || email.trim();
  return first ? [...first][0].toUpperCase() : "?";
}
