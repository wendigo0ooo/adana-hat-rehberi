# WebView JavaScript arayüzü korunur.
-keepclassmembers class com.wendigo.adanahat.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
