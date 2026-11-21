import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,privateDecrypt,constants,createDecipheriv} from 'node:crypto';
import {operations} from '../src/server/operations';import {fixture} from './helpers/billing-fixture';
test('operator maintenance is closed by default and rejects missing/wrong credentials',async()=>{
 const {env}=fixture();const req=new Request('https://test/api/operations/backup-keys',{method:'POST'});
 await assert.rejects(operations(req,env),(e:any)=>e.status===404);
 env.OPERATIONS_TOKEN='operator-token';await assert.rejects(operations(req,env),(e:any)=>e.status===403);
});
test('recovery exports only ciphertext and independently recovered key decrypts canary',async()=>{
 const {env}=fixture();const pair=generateKeyPairSync('rsa',{modulusLength:4096,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 Object.assign(env,{OPERATIONS_TOKEN:'operator-token',RECOVERY_PUBLIC_KEY:pair.publicKey,AUTH_SECRET:'private-auth-fixture',CREDENTIALS_KEY:Buffer.alloc(32,7).toString('base64')});
 const req=new Request('https://test/api/operations/backup-keys',{method:'POST',headers:{Authorization:'Bearer operator-token'}});
 const result=await operations(req,env);const raw=await result.text();assert.ok(!raw.includes(env.AUTH_SECRET));assert.ok(!raw.includes(env.CREDENTIALS_KEY));
 const bundle=JSON.parse(raw);const restored=JSON.parse(privateDecrypt({key:pair.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(bundle.encrypted_keys,'base64')).toString());
 assert.equal(restored.AUTH_SECRET,env.AUTH_SECRET);
 const [,iv,data]=bundle.canary.split('.');const encrypted=Buffer.from(data,'base64');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(restored.CREDENTIALS_KEY,'base64'),Buffer.from(iv,'base64'));decipher.setAAD(Buffer.from(bundle.canary_tenant));decipher.setAuthTag(encrypted.subarray(-16));const clear=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString());assert.equal(clear.marker,bundle.canary_marker);
});
