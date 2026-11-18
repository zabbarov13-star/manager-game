'use strict';
const assert=require('node:assert/strict'),{canonical,stripSite}=require('./caddy-guard.cjs');
const privatePaths=['/internal','/internal/*','/admin','/admin/*','/api/internal','/api/internal/*','/api/admin','/api/admin/*'];
function sharedSite(domain){if(!/^[a-z0-9.-]+$/.test(domain))throw Error('Invalid domain');return `${domain} {\n route {\n  @private path ${privatePaths.join(' ')}\n  respond @private 404\n  @rooms path /api/rooms /api/rooms/*\n  reverse_proxy @rooms 127.0.0.1:8080\n  reverse_proxy 127.0.0.1:8443\n }\n}\n`;}
function verifySharedChange(before,after,domain){
 const a=stripSite(before,domain),b=stripSite(after,domain);assert.equal(canonical(a.config),canonical(b.config),'Unrelated Caddy configuration changed');assert.equal(b.owned.length,1);
 let routes=[b.owned[0]];while(routes.length===1&&routes[0].handle?.length===1&&routes[0].handle[0].handler==='subroute'){
  assert(Object.keys(routes[0]).every(k=>['match','handle','terminal'].includes(k)));assert(Object.keys(routes[0].handle[0]).every(k=>['handler','routes'].includes(k)));routes=routes[0].handle[0].routes;
 }
 assert.equal(routes.length,3,'Private deny, rooms and adapter routes must be ordered');
 const expected=[privatePaths,['/api/rooms','/api/rooms/*'],null];routes.forEach((r,i)=>{
  assert(Object.keys(r).every(k=>['match','handle'].includes(k)));if(expected[i]){assert.equal(r.match?.length,1);assert.deepEqual(Object.keys(r.match[0]),['path']);assert.equal(canonical([...r.match[0].path].sort()),canonical([...expected[i]].sort()));}else assert(!r.match);
  assert.equal(r.handle?.length,1);const h=r.handle[0];if(i===0){assert.equal(h.handler,'static_response');assert.equal(String(h.status_code),'404');assert(Object.keys(h).every(k=>['handler','status_code'].includes(k)));}
  else assert.equal(canonical(h),canonical({handler:'reverse_proxy',upstreams:[{dial:i===1?'127.0.0.1:8080':'127.0.0.1:8443'}]}));
 });return {preservedOtherSites:true,sharedRooms:true,privateDenied:true};
}
module.exports={sharedSite,verifySharedChange,privatePaths};
