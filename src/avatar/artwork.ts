import rawMapping from "./layers.json" with { type: "json" };

type MappedItem = {
  key: string; colorKey?: string; colors: number[];
  options: Array<{ value: number; colors: number[] }>;
  paths: Array<{ path: string; layer: number; validOptions?: number[] }>;
};
const mapping: { observedAt: string; backgrounds: number[]; frames: number[];
  configurations: Array<{ race: string; gender: number; items: MappedItem[] }> } = rawMapping;

export const AVATAR_ASSET_ORIGIN = "https://d36mxiodymuqjm.cloudfront.net";
const SIZE = 768;
const MAX_LAYERS = 24;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_PNG_BYTES = 4 * 1024 * 1024;
type Avatar = Record<string, unknown>;
export type AvatarLayer = { url: string; layer: number; key: string };

export class AvatarArtworkError extends Error {}

function integer(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AvatarArtworkError("Missing or invalid avatar selection: " + key);
  }
  return value;
}

export function avatarLayers(avatar: Avatar): AvatarLayer[] {
  const config = mapping.configurations.find(c => c.race === avatar.race && c.gender === avatar.gender);
  if (!config) throw new AvatarArtworkError("Unsupported avatar race or body variant.");
  if (avatar.body !== 1) throw new AvatarArtworkError("Unsupported avatar body selection.");
  const face = config.items.find(item => item.key === "face")!;
  const skin = integer(avatar.skin_color, "skin_color");
  if (!face.colors.includes(skin)) throw new AvatarArtworkError("Unsupported skin color.");
  const layers: AvatarLayer[] = [];
  const add = (path: string, layer: number, key: string) => {
    if (!/^\/avatars\/[a-zA-Z0-9/_-]+\.webp$/.test(path)) throw new AvatarArtworkError("Invalid mapped asset path.");
    layers.push({ url: AVATAR_ASSET_ORIGIN + "/website" + path, layer, key });
  };
  const background = integer(avatar.background, "background");
  const frame = integer(avatar.frame, "frame");
  if (!mapping.backgrounds.includes(background) || !mapping.frames.includes(frame)) {
    throw new AvatarArtworkError("Unsupported background or frame.");
  }
  if (background) add("/avatars/backgrounds/bg_" + background + ".webp", 0, "background");
  add("/avatars/body/" + config.race + "/" + config.gender + "/body1_c" + skin + ".webp", 8, "body");
  const metadata = new Set(["race", "gender", "body", "background", "frame", "level", "color", "badges", "is_saved", "avatar_resets", "player_card_resets"]);
  for (const [key, value] of Object.entries(avatar)) {
    if (!metadata.has(key) && !key.endsWith("_color") && value && !config.items.some(item => item.key === key)) {
      throw new AvatarArtworkError("Unsupported avatar selection: " + key);
    }
  }
  for (const item of config.items) {
    let selected = integer(avatar[item.key], item.key);
    if (!selected && item.key === "cloth") selected = item.options[0]!.value;
    if (!selected) continue;
    const option = item.options.find(o => o.value === selected);
    if (!option) throw new AvatarArtworkError("Unsupported avatar selection: " + item.key);
    let color = 1;
    if (["nose", "ears"].includes(item.key) || (config.race === "orc" && ["mouth", "earrings", "eyebrows"].includes(item.key))) {
      color = skin;
    } else if (["eyebrows", "mustache", "beard"].includes(item.key) || (config.race === "human" && config.gender === 1 && item.key === "mouth")) {
      color = integer(avatar.hair_color, "hair_color");
    } else {
      const colors = item.colors.length ? item.colors : option.colors;
      if (colors.length) {
        const supplied = item.key === "cloth" && avatar.cloth === 0 ? colors[0]! : integer(avatar[item.colorKey ?? ""], item.colorKey ?? item.key);
        if (!colors.includes(supplied)) throw new AvatarArtworkError("Unsupported color for " + item.key);
        color = supplied;
      }
    }
    for (const path of item.paths) {
      if (path.validOptions && !path.validOptions.includes(selected)) continue;
      add(path.path.replace("{option}", String(selected)).replace("{color}", String(color)), path.layer, item.key);
    }
  }
  if (frame) add("/avatars/frames/frame_" + frame + ".webp", 50, "frame");
  if (layers.length > MAX_LAYERS) throw new AvatarArtworkError("Avatar layer limit exceeded.");
  const order = Object.keys(avatar);
  return layers.sort((a, b) => a.layer - b.layer || order.indexOf(a.key) - order.indexOf(b.key));
}

export function createAvatarRenderer(fetcher: typeof fetch = fetch) {
  let active = false;
  return async (avatar: Avatar) => {
    if (active) throw new AvatarArtworkError("An avatar render is already running; retry after it finishes.");
    const layers = avatarLayers(avatar);
    active = true;
    try {
      const signal = AbortSignal.timeout(45_000);
      const { default: sharp } = await import("sharp");
      const buffers: Buffer[] = [];
      let total = 0;
      for (const [index, layer] of layers.entries()) {
        signal.throwIfAborted();
        if (index) await new Promise(resolve => setTimeout(resolve, 100));
        const response = await fetcher(layer.url, { redirect: "error", signal });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/webp") || !response.body) {
          await response.body?.cancel();
          throw new AvatarArtworkError("An official avatar asset is unavailable.");
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            total += chunk.value.byteLength;
            if (size > MAX_ASSET_BYTES || total > MAX_TOTAL_BYTES) {
              await reader.cancel();
              throw new AvatarArtworkError("Avatar asset byte limit exceeded.");
            }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
        const input = Buffer.concat(chunks);
        if (input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WEBP") {
          throw new AvatarArtworkError("Invalid avatar asset format.");
        }
        const info = await sharp(input, { failOn: "warning", limitInputPixels: SIZE * SIZE }).metadata();
        if (info.format !== "webp" || info.width !== SIZE || info.height !== SIZE || (info.pages ?? 1) !== 1) {
          throw new AvatarArtworkError("Unsupported avatar asset dimensions or animation.");
        }
        buffers.push(input);
      }
      signal.throwIfAborted();
      const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: "#0F111C" } })
        .composite(buffers.map(input => ({ input, top: 0, left: 0, failOn: "warning" as const, limitInputPixels: SIZE * SIZE })))
        .png().timeout({ seconds: 10 }).toBuffer();
      if (png.byteLength > MAX_PNG_BYTES) throw new AvatarArtworkError("Avatar output byte limit exceeded.");
      return { png, metadata: { mime_type: "image/png", width: SIZE, height: SIZE, level_overlay: false, layer_count: layers.length,
        mapping_observed_at: mapping.observedAt, excluded_overlays: ["level numeral", "badges", "exemplar level frame and gem"] } };
    } catch (error) {
      if (error instanceof AvatarArtworkError) throw error;
      throw new AvatarArtworkError("Avatar rendering failed or exceeded its bounds.");
    } finally { active = false; }
  };
}
