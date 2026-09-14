import { expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { bindRequest } from "../src/catalogue/index.js";
import { SplinterlandsHttpClient } from "../src/http/client.js";

it("resolves an avatar redirect through MCP without fetching image bytes", async () => {
  const requests: string[] = [];
  const server = createServer({fetch:async(url, options)=>{
    requests.push(String(url));
    expect(options?.redirect).toBe("manual");
    return new Response("Found", {status:302,headers:{location:"https://runi.splinterlands.com/avatars/1000.png"}});
  }, sleep:async()=>undefined,limiterOptions:{sleep:async()=>undefined}});
  const client = new Client({name:"avatar-test",version:"0.0.0"});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  try {
    const result=await client.callTool({name:"player_avatar",arguments:{name:"fixture-account"}});
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      avatar_url:"https://api.splinterlands.com/players/avatar/fixture-account",
      image_url:"https://runi.splinterlands.com/avatars/1000.png",redirect_status:302,
    });
    expect(requests).toEqual(["https://api.splinterlands.com/players/avatar/fixture-account"]);
    expect((await client.callTool({name:"player_avatar",arguments:{name:"../escape"}})).isError).toBe(true);
    expect(requests).toHaveLength(1);
  } finally {await client.close();await server.close();}
});

it("refuses missing, unsafe and unexpected redirect destinations", async () => {
  const bound=bindRequest("api.players.avatar",{name:"fixture-account"});
  const credentialUrl = new URL("https://runi.splinterlands.com/avatar.png");
  credentialUrl.username = "fixture";
  credentialUrl.password = "fixture";
  for(const location of [undefined,"http://runi.splinterlands.com/avatar.png",
    "https://splinterlands.com.evil.example/avatar.png","https://example.com/avatar.png",
    credentialUrl.href,
    "https://runi.splinterlands.com:444/avatar.png","https://runi.splinterlands.com/avatar.png#fragment",
    "/relative.png","data:image/png;base64,AAAA"]){
    let requests=0;
    const client=new SplinterlandsHttpClient({fetch:async()=>{requests++;return new Response("Found",{status:302,headers:location?{location}:{}});}});
    expect((await bound.execute(client)).ok).toBe(false);
    expect(requests).toBe(1);
  }
});

it("does not enable redirects for ordinary JSON routes", async () => {
  const bound=bindRequest("api.last-block",{});
  const client=new SplinterlandsHttpClient({fetch:async(_url,options)=>{
    expect(options?.redirect).toBe("error");
    return Response.json({last_block:1});
  }});
  await bound.execute(client);
});
