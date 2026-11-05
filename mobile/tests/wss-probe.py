"""Real HTTPS WebSocket upgrade against the existing PeerServer, no room/game mutation."""
import os,urllib.parse,http.client,ssl,secrets,base64,hashlib,json
host='manager-peer-server.onrender.com';proxy=urllib.parse.urlsplit(os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or '')
try:
 if proxy.hostname:
  c=http.client.HTTPSConnection(proxy.hostname,proxy.port or 80,timeout=45,context=ssl.create_default_context());headers={}
  if proxy.username:headers['Proxy-Authorization']='Basic '+base64.b64encode((urllib.parse.unquote(proxy.username)+':'+urllib.parse.unquote(proxy.password or '')).encode()).decode()
  c.set_tunnel(host,443,headers=headers)
 else:c=http.client.HTTPSConnection(host,443,timeout=45,context=ssl.create_default_context())
 key=base64.b64encode(secrets.token_bytes(16)).decode();path='/peerjs/peerjs?key=peerjs&id=mgr-native-qa-'+secrets.token_hex(8)+'&token='+secrets.token_hex(12)
 c.request('GET',path,headers={'Host':host,'Upgrade':'websocket','Connection':'Upgrade','Sec-WebSocket-Key':key,'Sec-WebSocket-Version':'13','Origin':'https://appassets.androidplatform.net'})
 r=c.getresponse();expected=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode();assert r.status==101,(r.status,r.reason);assert r.getheader('Sec-WebSocket-Accept')==expected
 result={'endpoint':'wss://'+host+'/peerjs/peerjs','status':101,'validWebSocketAccept':True,'dataChannelTested':False};c.close()
except Exception as e:result={'error':str(e),'dataChannelTested':False}
print(json.dumps(result,indent=2));open('mobile/tests/wss-result.json','w').write(json.dumps(result,indent=2)+'\n')
