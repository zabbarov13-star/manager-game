package ru.manager.backtothepast;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class MainActivity extends Activity {
 private static final String HOST="appassets.androidplatform.net", PAGE="https://"+HOST+"/assets/game.html";
 private WebView web; private volatile boolean online=false;
 private ValueCallback<Uri[]> fileCallback; private String pendingExport;
 private static final int IMPORT=41,EXPORT=42;
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);getWindow().setStatusBarColor(Color.rgb(23,56,75));getWindow().setNavigationBarColor(Color.rgb(23,56,75));
  FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(23,56,75));
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});
  try{web=new WebView(this);}catch(RuntimeException e){TextView error=new TextView(this);error.setText("Обновите Android System WebView или Chrome и откройте игру снова.");root.addView(error);setContentView(root);return;}
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);
  settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(true);settings.setSupportMultipleWindows(false);settings.setTextZoom(100);
  web.addJavascriptInterface(new Bridge(),"ManagerAndroid");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !local(request.getUrl());}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    Uri u=request.getUrl();try{if(local(u)){Map<String,String> h=new HashMap<>();h.put("Cache-Control","no-store");h.put("X-Content-Type-Options","nosniff");return new WebResourceResponse("text/html","UTF-8",200,"OK",h,getAssets().open("game.html"));}}catch(IOException e){ }
    if(online&&"https".equals(u.getScheme())&&!HOST.equals(u.getHost()))return null;
    return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
   }
   @Override public void onPageFinished(WebView view,String url){if(local(Uri.parse(url)))web.evaluateJavascript("window.dispatchEvent(new Event('resize'));console.log('MANAGER_READY '+JSON.stringify({secure:isSecureContext,title:document.title,buttons:document.querySelectorAll('button').length,rtc:typeof RTCPeerConnection,native:!!window.ManagerNative}))",null);}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest r){r.deny();} // Data-channel WebRTC needs no camera/microphone permission.
   @Override public boolean onConsoleMessage(ConsoleMessage m){android.util.Log.i("ManagerWeb",m.message());return true;}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");try{startActivityForResult(i,IMPORT);}catch(RuntimeException e){fileCallback.onReceiveValue(null);fileCallback=null;toast("Файловый менеджер недоступен");}return true;}
  });
  root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);web.loadUrl(PAGE);hideBars();
 }
 private boolean local(Uri u){return u!=null&&"https".equals(u.getScheme())&&HOST.equals(u.getHost())&&"/assets/game.html".equals(u.getPath())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null&&u.getQuery()==null;}
 private void hideBars(){if(Build.VERSION.SDK_INT>=30){WindowInsetsController c=getWindow().getInsetsController();if(c!=null){c.hide(WindowInsets.Type.statusBars()|WindowInsets.Type.navigationBars());c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);}}else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);}
 @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)hideBars();}
 private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
 public final class Bridge {
  @JavascriptInterface public void enableNetwork(){online=true;}
  @JavascriptInterface public void saveText(String name,String text,String mime){if(text==null||text.length()>20000000)return;runOnUiThread(()->{if(web==null||!local(Uri.parse(web.getUrl()))||pendingExport!=null)return;String file=name!=null&&name.matches("[A-Za-z0-9_.-]{1,100}\\.(json|csv)")?name:"manager-save.json";pendingExport=text;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(file.endsWith(".csv")?"text/csv":"application/json").putExtra(Intent.EXTRA_TITLE,file);try{startActivityForResult(i,EXPORT);}catch(RuntimeException e){pendingExport=null;toast("Не удалось открыть сохранение файла");}});}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==IMPORT&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}if(request==EXPORT){String text=pendingExport;pendingExport=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&text!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));toast("Файл сохранён");}catch(IOException e){toast("Не удалось сохранить файл");}}}}
 @Override protected void onPause(){super.onPause();if(web!=null){web.evaluateJavascript("document.querySelectorAll('audio').forEach(a=>a.pause())",null);web.onPause();CookieManager.getInstance().flush();}}
 @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("window.dispatchEvent(new Event('manager-resume'))",null);}}
 @Override public void onBackPressed(){if(web==null){super.onBackPressed();return;}web.evaluateJavascript("(()=>{const d=[...document.querySelectorAll('dialog[open]')].at(-1);if(d){d.close();return true;}return false;})()",result->{if(!"true".equals(result))new AlertDialog.Builder(this).setMessage(online?"Закрыть приложение? В сетевой партии хост должен оставаться подключённым. Локальная партия сохранена.":"Закрыть игру? Локальная партия сохранена автоматически.").setPositiveButton("Закрыть",(d,w)->finish()).setNegativeButton("Продолжить",null).show();});}
 @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("ManagerAndroid");web.destroy();}super.onDestroy();}
}
