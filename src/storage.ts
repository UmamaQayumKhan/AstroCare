export type RecordEntry={id:string;profile:string;timestamp:string;source:string;sync:string;mission:string;symptoms:string;[key:string]:any};
let dbPromise:Promise<IDBDatabase>;
function db(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('astrocare-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function tx<T>(store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>){const d=await db();return new Promise<T>((resolve,reject)=>{const t=d.transaction(store,mode),r=fn(t.objectStore(store));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
export const allRecords=()=>tx<RecordEntry[]>('records','readonly',s=>s.getAll());
export const saveRecord=(r:RecordEntry)=>tx('records','readwrite',s=>s.put(r));
export const getSetting=(key:string)=>tx<any>('settings','readonly',s=>s.get(key));
export const setSetting=(key:string,value:any)=>tx('settings','readwrite',s=>s.put(value,key));
let syncing=false;
export async function synchronize(){if(syncing)return false;syncing=true;try{const base=import.meta.env.VITE_API_URL||'';const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2500)});if(!health.ok||!(await health.json()).ok)return false;for(const r of await allRecords()){if(r.sync!=='pending')continue;const response=await fetch(base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(`Synchronization failed (${response.status}). Records remain on this device.`);await saveRecord({...r,sync:'synced'});}return true;}catch{return false;}finally{syncing=false;}}
export const deleteRecord=(id:string)=>tx('records','readwrite',s=>s.delete(id));
