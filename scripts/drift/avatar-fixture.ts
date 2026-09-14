import { avatarRedirectData } from "../../src/http/avatar-redirect.js";
import type { BoundCatalogueRequest } from "../../src/catalogue/index.js";

function projection(value: unknown, requestUrl: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid avatar projection.");
  const body = value as Record<string, unknown>;
  if (body.avatar_url !== requestUrl || body.redirect_status !== 302 || typeof body.image_url !== "string"
    || !avatarRedirectData(new Response(null, { status: 302, headers: { location: body.image_url } }), new URL(requestUrl))) {
    throw new Error("Invalid avatar projection.");
  }
  return body;
}

export function avatarFixtureBody(existing: Record<string, unknown>, captured: unknown, binding: BoundCatalogueRequest) {
  const live = projection(captured, "https://" + binding.hostname + binding.path.value);
  const reviewed = projection(existing.body, "https://api.splinterlands.com/players/avatar/fixture-account");
  // Retain synthetic URLs without hiding unexpected fields from the sanitizer.
  return { ...live, avatar_url: reviewed.avatar_url, image_url: reviewed.image_url };
}
