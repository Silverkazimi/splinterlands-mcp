import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
const noDiskWrite=(stderr:string)=>expect(stderr).not.toContain("MCP_DISK_WRITE_ATTEMPT:");
async function run(plant=""){
 const client=new Client({name:"no-disk-auth-audit",version:"0.0.0"});
 const transport=new StdioClientTransport({
  command:process.execPath,
  args:["--import",fileURLToPath(new URL("./support/no-disk-auth-preload.mjs",import.meta.url)),fileURLToPath(new URL("../dist/index.js",import.meta.url))],
  env:{MCP_TEST_WRITE_PLANT:plant},stderr:"pipe",
 });
 let stderr="";transport.stderr?.on("data",chunk=>{stderr+=String(chunk);});
 try{
  await client.connect(transport);
  const before=(await client.listTools()).tools.map(t=>t.name);
  const result=await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:101}},undefined,{timeout:15000});
  const after=(await client.listTools()).tools.map(t=>t.name);
  expect(after).toEqual(before);
  if(!plant){
   expect(result).toMatchObject({isError:true,structuredContent:{kind:"endpoint_requires_auth"}});
   expect(await client.callTool({name:"land_deed_by_plot",arguments:{plot_id:101}}))
    .toMatchObject({isError:true,structuredContent:{kind:"endpoint_requires_auth"}});
  }
 }finally{await client.close();}
 return stderr;
}
it("keeps auth-refused tools listed without invoking filesystem mutation APIs",async()=>{
 noDiskWrite(await run());
},20000);
it.each(["sync","async","stream"])("the same no-write assertion rejects a planted %s write",async(plant)=>{
 const stderr=await run(plant);
 expect(()=>noDiskWrite(stderr)).toThrow(/MCP_DISK_WRITE_ATTEMPT:/);
},20000);
