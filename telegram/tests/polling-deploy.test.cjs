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


test('Manager installer waits through startup connection refusals and bounds timeout',t=>{
 const script=resolve(__dirname,'../deploy/enable-outbound-updates.py');
 const code=String.raw\`
import importlib.util,sys,contextlib
spec=importlib.util.spec_from_file_location("manager_installer",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
calls=[]
m.request.urlopen=lambda *args,**kwargs: (_ for _ in ()).throw(ConnectionRefusedError()) if len(calls)<2 else contextlib.nullcontext(object())
m.json.load=lambda _: {"ok":True,"mode":"adapter"}
m.cmd=lambda *args,**kwargs: calls.append(args)
# Record failed HTTP attempts, so success happens on the third attempt.
n=[0]
def open_with_retry(*a,**k):
    n[0]+=1
    if n[0]<3: raise ConnectionRefusedError()
    return contextlib.nullcontext(object())
m.request.urlopen=open_with_retry
m.wait_for_adapter(seconds=2,pause=0)
assert n[0]==3, n
assert calls==[("systemctl","is-active","--quiet","manager-telegram.service")],calls
now=[0.0]
m.time.monotonic=lambda:now[0]
m.time.sleep=lambda delta:now.__setitem__(0,now[0]+delta)
m.request.urlopen=lambda *a,**k:(_ for _ in ()).throw(ConnectionRefusedError())
try:m.wait_for_adapter(seconds=0.3,pause=0.1)
except RuntimeError as e:assert "did not become healthy" in str(e)
else:raise AssertionError("timeout never raised")
\`;
 const output=spawnSync('python3',['-B','-c',code,script],{encoding:'utf8',timeout:10000});
 if(output.error?.code==='ENOENT'){t.skip('Python is not installed on this test machine');return;}
 assert.equal(output.status,0,output.stderr);
});
