import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
 var window: UIWindow?
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = GameController(); window?.makeKeyAndVisible(); return true
 }
}
final class GameController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
 private var offline: WKWebView!; private var online: WKWebView?; private var back: UIButton!; private var gameURL: URL!; private var exportURL: URL?
 private let onlineURL = URL(string: "https://zabbarov13-star.github.io/manager-game/game-0.18.3.html")!
 override var prefersStatusBarHidden: Bool { true }
 override var prefersHomeIndicatorAutoHidden: Bool { true }
 override func viewDidLoad() {
  super.viewDidLoad(); view.backgroundColor = UIColor(red: 0.09, green: 0.22, blue: 0.29, alpha: 1)
  let config = WKWebViewConfiguration(); config.websiteDataStore = .default(); config.userContentController.add(self, name: "manager")
  let seed = UserDefaults.standard.dictionary(forKey: "manager.offline.storage") as? [String: String] ?? [:]
  let data = (try? JSONSerialization.data(withJSONObject: seed)) ?? Data("{}".utf8)
  let script = """
  (()=>{try{const seed=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('\(data.base64EncodedString())'),c=>c.charCodeAt(0))));for(const[k,v]of Object.entries(seed))localStorage.setItem(k,v);const push=()=>{const values={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('manager.'))values[k]=localStorage.getItem(k);}window.webkit.messageHandlers.manager.postMessage({action:'storage',values});};for(const n of ['setItem','removeItem','clear']){const old=Storage.prototype[n];Storage.prototype[n]=function(...a){const r=old.apply(this,a);if(this===localStorage)push();return r;};}addEventListener('pagehide',push);}catch(e){console.warn(e);}})();
  """
  config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
  offline = WKWebView(frame: .zero, configuration: config); offline.navigationDelegate = self; offline.translatesAutoresizingMaskIntoConstraints = false
  view.addSubview(offline); NSLayoutConstraint.activate([offline.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),offline.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),offline.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),offline.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
  guard let url = Bundle.main.url(forResource: "game", withExtension: "html") else { showError("В приложении отсутствуют игровые ресурсы"); return }
  gameURL = url; offline.loadFileURL(url, allowingReadAccessTo: url)
  NotificationCenter.default.addObserver(self, selector: #selector(pauseAudio), name: UIApplication.willResignActiveNotification, object: nil)
  NotificationCenter.default.addObserver(self, selector: #selector(resume), name: UIApplication.didBecomeActiveNotification, object: nil)
 }
 @objc private func pauseAudio(){for w in [offline, online].compactMap({$0}) {w.evaluateJavaScript("document.querySelectorAll('audio').forEach(a=>a.pause())",completionHandler:nil)}}
 @objc private func resume(){(online ?? offline)?.evaluateJavaScript("window.dispatchEvent(new Event('manager-resume'))",completionHandler:nil)}
 private func openOnline(){
  pauseAudio(); if online != nil { return }
  let config=WKWebViewConfiguration();config.websiteDataStore = .default()
  if let u=Bundle.main.url(forResource:"compact-room",withExtension:"js"),let script=try? String(contentsOf:u,encoding:.utf8){config.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentEnd,forMainFrameOnly:true))}
  let w=WKWebView(frame:.zero,configuration:config);w.navigationDelegate=self;w.translatesAutoresizingMaskIntoConstraints=false;view.addSubview(w);online=w
  back=UIButton(type:.system);back.setTitle("‹ Локальная игра",for:.normal);back.setTitleColor(.white,for:.normal);back.backgroundColor=view.backgroundColor;back.accessibilityIdentifier="back-to-offline";back.translatesAutoresizingMaskIntoConstraints=false;back.addTarget(self,action:#selector(closeOnline),for:.touchUpInside);view.addSubview(back)
  NSLayoutConstraint.activate([back.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),back.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor),back.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor),back.heightAnchor.constraint(equalToConstant:44),w.topAnchor.constraint(equalTo:back.bottomAnchor),w.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),w.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor),w.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor)])
  w.load(URLRequest(url:onlineURL))
 }
 @objc private func closeOnline(){
  let alert=UIAlertController(title:"Вернуться к локальной игре?",message:"Сетевое соединение закроется. Хост должен оставаться в комнате для продолжения партии.",preferredStyle:.alert)
  alert.addAction(UIAlertAction(title:"Остаться",style:.cancel));alert.addAction(UIAlertAction(title:"Вернуться",style:.default){[weak self]_ in self?.online?.stopLoading();self?.online?.removeFromSuperview();self?.online=nil;self?.back?.removeFromSuperview();self?.back=nil});present(alert,animated:true)
 }
 func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
  guard let url=navigationAction.request.url else{decisionHandler(.cancel);return}
  let allowed = webView === offline ? (url.isFileURL && url.path==gameURL?.path) : (url.scheme=="https" && url.host==onlineURL.host && url.path==onlineURL.path)
  decisionHandler(allowed ? .allow : .cancel)
 }
 func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){if webView === online{showError("Не удалось открыть онлайн. Проверьте интернет и повторите вход. Локальная игра доступна без сети.")}}
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
  if webView === online {webView.evaluateJavaScript("(()=>{const mode=document.getElementById('party-mode');if(mode){mode.value='online';mode.dispatchEvent(new Event('change'));}})()",completionHandler:nil)}
  if ProcessInfo.processInfo.arguments.contains("-manager-smoke") && webView === offline {
   webView.evaluateJavaScript("(()=>{const previous=localStorage.getItem('manager.qa-probe');localStorage.setItem('manager.qa-probe','persisted');return JSON.stringify({previous,title:document.title,body:document.body.innerText.length,buttons:document.querySelectorAll('button').length,svg:document.querySelectorAll('svg').length,storage:localStorage.getItem('manager.qa-probe'),native:!!window.ManagerNative});})()") { result,error in if let text=result as? String { NSLog("MANAGER_SMOKE %@",text) } else { NSLog("MANAGER_SMOKE_ERROR %@",String(describing:error)) } }
  }
 }
 func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
  guard message.frameInfo.isMainFrame,message.webView === offline,message.frameInfo.request.url?.isFileURL==true,message.frameInfo.request.url?.path==gameURL?.path,let body=message.body as?[String:Any],let action=body["action"] as?String else{return}
  if action=="online" {openOnline()}
  else if action=="storage",let values=body["values"] as?[String:String],values.count<=100,values.allSatisfy({$0.key.hasPrefix("manager.") && $0.value.utf8.count<=20_000_000}){UserDefaults.standard.set(values,forKey:"manager.offline.storage")}
  else if action=="export",let name=body["name"] as?String,let text=body["text"] as?String,text.utf8.count<=20_000_000,name.range(of:"^[A-Za-z0-9_.-]{1,100}\\.(json|csv)$",options:.regularExpression) != nil {
   do{let dir=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true);let file=dir.appendingPathComponent(name);try Data(text.utf8).write(to:file);exportURL=file;let picker=UIDocumentPickerViewController(forExporting:[file],asCopy:true);picker.delegate=self;present(picker,animated:true)}catch{showError("Не удалось сохранить файл")}
  }
 }
 func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController){clearExport()}
 func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]){clearExport()}
 private func clearExport(){if let file=exportURL{try? FileManager.default.removeItem(at:file.deletingLastPathComponent())};exportURL=nil}
 private func showError(_ text:String){let alert=UIAlertController(title:"Менеджер",message:text,preferredStyle:.alert);alert.addAction(UIAlertAction(title:"Понятно",style:.default));present(alert,animated:true)}
}
