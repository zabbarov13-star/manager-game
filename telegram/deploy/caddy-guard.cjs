'use strict';
const assert=require('node:assert/strict');
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
function stripSite(config,domain){const copy=JSON.parse(JSON.stringify(config)),owned=[];
 for(const server of Object.values(copy.apps?.http?.servers??{}))if(Array.isArray(server.routes))server.routes=server.routes.filter(route=>{
  const match=route.match;if(!Array.isArray(match)||!match.length)return true;
  const mentions=match.some(m=>Array.isArray(m.host)&&m.host.includes(domain));if(!mentions)return true;
  if(!match.every(m=>Object.keys(m).length===1&&Array.isArray(m.host)&&m.host.length===1&&m.host[0]===domain))throw Error('Manager shares a route matcher with another site; automatic editing refused.');owned.push(route);return false;
 });return {config:copy,owned};
}
function verifyCaddyChange(before,after,domain){
 if(!/^[a-z0-9.-]+$/.test(domain))throw Error('Invalid approved domain.');const old=stripSite(before,domain),next=stripSite(after,domain);
 assert.equal(canonical(old.config),canonical(next.config),'An unrelated Caddy route, listener, TLS policy or setting changed.');
 if(next.owned.length!==1)throw Error('Exactly one isolated Manager host route is required.');
 const dials=[];function walk(v){if(!v||typeof v!=='object')return;if(v.handler==='reverse_proxy')for(const upstream of v.upstreams??[])dials.push(upstream.dial);for(const child of Object.values(v))if(typeof child==='object')Array.isArray(child)?child.forEach(walk):walk(child);}
 walk(next.owned[0]);if(dials.length!==1||dials[0]!=='127.0.0.1:8443')throw Error('Manager upstream must be exactly 127.0.0.1:8443.');return {preservedOtherSites:true,managerRouteCount:1};
}
module.exports={canonical,stripSite,verifyCaddyChange};
