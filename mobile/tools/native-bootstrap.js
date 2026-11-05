(()=>{
 let enabled=false;
 const enable=()=>{enabled=true;window.ManagerAndroid?.enableNetwork();};
 const fetch0=window.fetch.bind(window);
 window.fetch=(input,options)=>{const url=String(typeof input==='string'||input instanceof URL?input:input.url);if(/^(data:|blob:)/.test(url)||enabled)return fetch0(input,options);return Promise.reject(Error('Сеть включается при выборе онлайн-режима'));};
 for(const name of ['WebSocket','RTCPeerConnection']){const Original=window[name];if(Original)window[name]=new Proxy(Original,{construct(target,args){if(!enabled)throw Error('Выберите онлайн-режим');return Reflect.construct(target,args);}});}
 const send0=navigator.sendBeacon?.bind(navigator);if(send0)navigator.sendBeacon=(...args)=>enabled?send0(...args):false;
 window.ManagerNative={enableNetwork:enable,embeddedOnline:true};
 if(window.webkit?.messageHandlers?.manager){window.ManagerNative.openOnline=()=>window.webkit.messageHandlers.manager.postMessage({action:'online'});}
 const click0=HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){const name=this.download;fetch0(this.href).then(r=>r.text()).then(text=>{if(window.ManagerAndroid)window.ManagerAndroid.saveText(name,text,name.endsWith('.json')?'application/json':'text/csv');else if(window.webkit?.messageHandlers?.manager)window.webkit.messageHandlers.manager.postMessage({action:'export',name,text});else click0.call(this);}).catch(()=>alert('Не удалось экспортировать файл'));return;}return click0.call(this);};
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&/^https?:/.test(a.href)&&!a.download){e.preventDefault();}},true);
})();
