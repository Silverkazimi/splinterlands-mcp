import { expect, it } from "vitest";
import sharp from "sharp";
import mapping from "../src/avatar/layers.json" with { type: "json" };
import { avatarLayers, AVATAR_ASSET_ORIGIN, createAvatarRenderer } from "../src/avatar/artwork.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

function sample(race = "orc", gender = 1): Record<string, unknown> {
  const config = mapping.configurations.find(c => c.race === race && c.gender === gender)!;
  const result: Record<string, unknown> = { race, gender, body: 1, skin_color: 1, hair_color: 1, background: 1, frame: 1, level: 25 };
  for (const item of config.items) {
    const option = item.options[0]!;
    result[item.key] = option.value;
    if (item.colorKey) result[item.colorKey] = (item.colors.length ? item.colors : option.colors)[0] ?? 0;
  }
  return result;
}
const asset = () => sharp({ create: { width: 768, height: 768, channels: 4, background: "#2468ac" } }).webp().toBuffer();

it("maps all eight official body variants to bounded fixed-host layers without level overlays", () => {
  for (const config of mapping.configurations) {
    const a = sample(config.race, config.gender);
    const layers = avatarLayers(a);
    expect(layers.length).toBeGreaterThan(5);
    expect(layers.length).toBeLessThanOrEqual(24);
    expect(layers.every(l => l.url.startsWith(AVATAR_ASSET_ORIGIN + "/website/avatars/"))).toBe(true);
    expect(avatarLayers({ ...a, level: 999 })).toEqual(layers);
    expect(layers.some(l => /top_frames|battle_frames|badges/.test(l.url))).toBe(false);
  }
  expect(() => avatarLayers({ ...sample(), hat: 99999 })).toThrow("Unsupported avatar selection");
  expect(() => avatarLayers({ ...sample(), race: "../escape" })).toThrow("Unsupported avatar race");
  expect(() => avatarLayers({ ...sample(), racial1: 7 })).toThrow("Unsupported avatar selection");
});

it("honors cosmetic and back-layer option mappings", () => {
  const a = { ...sample(), hair: 8, hair_color: 7, cloth: 108, tattoo: 20, accessory: 103 };
  const layers = avatarLayers(a);
  expect(layers.some(l => l.url.endsWith("/hair/orc/1/hair8_c7.webp"))).toBe(true);
  expect(layers.some(l => l.url.includes("/hair_back/"))).toBe(false);
  expect(layers.some(l => l.url.endsWith("/outfit/orc/1/clot108_c1.webp"))).toBe(true);
});

it("composes identical artwork when only level changes", async () => {
  const webp = await asset();
  const renderer = createAvatarRenderer(async (_url, options) => {
    expect(options?.redirect).toBe("error");
    return new Response(webp, { headers: { "content-type": "image/webp" } });
  });
  const first = await renderer(sample());
  const second = await renderer({ ...sample(), level: 99 });
  expect(first.png.equals(second.png)).toBe(true);
  expect(first.metadata.level_overlay).toBe(false);
  expect(await sharp(first.png).metadata()).toMatchObject({ format: "png", width: 768, height: 768 });
}, 15000);

it("rejects redirects, oversized assets and non-WebP bodies instead of partial art", async () => {
  const bodies = [
    () => new Response(null, { status: 302, headers: { location: "https://example.test/image.webp" } }),
    () => new Response("not an image", { headers: { "content-type": "image/webp" } }),
    () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1), { headers: { "content-type": "image/webp" } }),
  ];
  for (const response of bodies) await expect(createAvatarRenderer(async () => response())(sample())).rejects.toThrow();
  const wrongSize = await sharp({ create: { width: 1, height: 1, channels: 4, background: "red" } }).webp().toBuffer();
  await expect(createAvatarRenderer(async () => new Response(wrongSize, { headers: { "content-type": "image/webp" } }))(sample())).rejects.toThrow("dimensions");
});

it("returns image content only on explicit render requests while retaining level metadata", async () => {
  const webp = await asset();
  const requests: string[] = [];
  const server = createServer({ fetch: async (url) => {
    requests.push(String(url));
    return String(url).startsWith(AVATAR_ASSET_ORIGIN)
      ? new Response(webp, { headers: { "content-type": "image/webp" } })
      : Response.json(sample());
  } });
  const client = new Client({ name: "artwork-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  try {
    const result = await client.callTool({ name: "player_custom_avatar", arguments: { name: "fixture-account", render: true } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ level: 25, artwork: { level_overlay: false } });
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "image", mimeType: "image/png" })]));
    expect(requests[0]).toBe("https://api.splinterlands.com/players/player_avatar/fixture-account");
    expect(requests.length).toBe(avatarLayers(sample()).length + 1);
  } finally { await client.close(); await server.close(); }
}, 15000);

it("refuses concurrent renders and releases capacity after completion", async () => {
  const webp = await asset();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const renderer = createAvatarRenderer(async () => {
    if (++calls === 1) await gate;
    return new Response(webp, { headers: { "content-type": "image/webp" } });
  });
  const first = renderer(sample());
  await expect(renderer(sample())).rejects.toThrow("already running");
  release();
  await first;
  expect((await renderer(sample())).png.byteLength).toBeGreaterThan(0);
}, 15000);
