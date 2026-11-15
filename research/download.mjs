// Public research data only. No credentials, API keys or user health records.
import {mkdir,writeFile} from 'node:fs/promises';
const directory=new URL('./data/',import.meta.url);
await mkdir(directory,{recursive:true});
const sources=[...['a','b'].map(s=>[`set-${s}.tar.gz`,`https://physionet.org/files/challenge-2012/1.0.0/set-${s}.tar.gz`]),...['DEMO_J','BPX_J','SLQ_J','DPQ_J'].map(n=>[`${n}.xpt`,`https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/${n}.xpt`])];
for(const [name,url] of sources){const r=await fetch(url);if(!r.ok)throw Error(`${name}: ${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.length<1000||b.subarray(0,40).toString().includes('<!DOCTYPE'))throw Error(`Invalid download: ${name}`);await writeFile(new URL(name,directory),b);console.log(name,b.length);}
