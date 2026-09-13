import fs from "node:fs";
import fsp from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import process from "node:process";
const deny=name=>{process.stderr.write("MCP_DISK_WRITE_ATTEMPT:"+name+"\n");throw new Error("Test refused filesystem mutation: "+name);};
const mutations=["appendFile","chmod","chown","copyFile","cp","fchmod","fchown","fdatasync","fsync","ftruncate","futimes","link","lchown","lutimes","mkdir","mkdtemp","rename","rm","rmdir","symlink","truncate","unlink","utimes","writeFile","writev"];
for(const name of mutations){
 for(const key of [name,name+"Sync"]){
  if(typeof fs[key]==="function")fs[key]=()=>deny(key);
 }
 if(typeof fsp[name]==="function")fsp[name]=async()=>deny("promises."+name);
}
fs.createWriteStream=()=>deny("createWriteStream");
const writable=flags=>typeof flags==="string"?/[wa+]/.test(flags):typeof flags==="number"&&(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0;
for(const name of ["open","openSync"]){
 const original=fs[name];
 fs[name]=function(path,flags,...args){if(writable(flags))deny(name);return original.call(fs,path,flags,...args);};
}
const originalOpen=fsp.open;
fsp.open=async function(path,flags,...args){if(writable(flags))deny("promises.open");return originalOpen.call(fsp,path,flags,...args);};
for(const name of ["write","writeSync"]){
 const original=fs[name];
 fs[name]=function(fd,...args){if(fd!==1&&fd!==2)deny(name);return original.call(fs,fd,...args);};
}
syncBuiltinESMExports();
Object.defineProperty(globalThis,"fetch",{value:async()=>{
 if(process.env.MCP_TEST_WRITE_PLANT==="sync")fs.writeFileSync("\0never-created","synthetic");
 if(process.env.MCP_TEST_WRITE_PLANT==="async")await fsp.writeFile("\0never-created","synthetic");
 if(process.env.MCP_TEST_WRITE_PLANT==="stream")fs.createWriteStream("\0never-created");
 return new globalThis.Response("{}",{status:401,headers:{"content-type":"application/json"}});
}});
