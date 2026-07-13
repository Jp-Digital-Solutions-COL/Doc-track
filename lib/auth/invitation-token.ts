import { randomBytes, createHash } from "node:crypto";

// El token en claro se manda por correo y JAMÁS se persiste — solo su hash.
export function generateInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}
