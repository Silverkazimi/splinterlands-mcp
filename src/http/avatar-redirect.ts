export function isAvatarRequest(host: string, path: string): boolean {
  return host === "api.splinterlands.com" && /^\/players\/avatar\/[a-z][a-z0-9.-]{2,15}$/.test(path);
}

export function avatarRedirectData(response: Response, requestUrl: URL) {
  if (response.status !== 302) return undefined;
  const location = response.headers.get("location");
  if (!location || location.length > 2048) return undefined;
  try {
    const image = new URL(location);
    if (image.protocol !== "https:" || image.username || image.password || image.port
      || image.hash || !(image.hostname === "splinterlands.com" || image.hostname.endsWith(".splinterlands.com"))) return undefined;
    return { avatar_url: requestUrl.toString(), image_url: image.href, redirect_status: 302 };
  } catch {
    return undefined;
  }
}
