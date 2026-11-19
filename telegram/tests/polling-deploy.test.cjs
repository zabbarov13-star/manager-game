'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');

test('optional polling deploy script has valid Python syntax and targets only Manager services',t=>{
 const script=resolve(__dirname,'../deploy/enable-outbound-updates.py');
 const py=spawnSync('python3',['-m','py_compile',script],{encoding:'utf8'});
 if(py.error?.code==='ENOENT'){t.skip('Python is not installed on this test machine');return;}
 assert.equal(py.status,0,py.stderr);
 const source=readFileSync(script,'utf8');
 assert(source.includes('ORIGINAL_SERVER_BLOB'));
 assert(source.includes('FIXED_SERVER_BLOB'));
 assert(source.includes('POLLER_BLOB'));
 assert(source.includes('deleteWebhook'));
 assert(source.includes('drop_pending_updates": False'));
 assert(!source.includes('docker '));
 assert(!source.includes('smaylokrut.service'));
});
