package com.wendigo.adanahat

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var geoOrigin: String? = null
    private var geoCallback: GeolocationPermissions.Callback? = null

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val callback = geoCallback
        val origin = geoOrigin
        geoCallback = null
        geoOrigin = null
        if (callback != null) callback.invoke(origin, granted, false)
        if (granted) {
            startLocationUpdates()
        } else {
            notifyJsError("Konum izni verilmedi. Ayarlardan izin verebilirsin.")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.app_bg))

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            setGeolocationEnabled(true)
            useWideViewPort = true
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url: Uri = request.url
                return when (url.scheme) {
                    "file" -> false
                    "http", "https" -> {
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                        true
                    }
                    "tel" -> {
                        startActivity(Intent(Intent.ACTION_DIAL, url))
                        true
                    }
                    "mailto" -> {
                        startActivity(Intent(Intent.ACTION_SENDTO, url))
                        true
                    }
                    else -> true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                    startLocationUpdates()
                } else {
                    geoOrigin = origin
                    geoCallback = callback
                    locationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                }
            }
        }

        webView.addJavascriptInterface(Bridge(), "AndroidBridge")
        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startLocationUpdates() {
        if (!hasLocationPermission()) {
            locationPermission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            return
        }
        val manager = getSystemService(LOCATION_SERVICE) as? LocationManager
        if (manager == null) {
            notifyJsError("Konum servisi bulunamadı.")
            return
        }

        val delivered = AtomicBoolean(false)
        fun send(location: Location) {
            if (!delivered.compareAndSet(false, true)) return
            webView.evaluateJavascript(
                "window.onNativeLocation && window.onNativeLocation(${location.latitude}, ${location.longitude})",
                null
            )
        }

        try {
            val now = System.currentTimeMillis()
            val last = manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (last != null && now - last.time < 300_000L) {
                send(last)
                return
            }

            val provider = when {
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
            if (provider == null) {
                notifyJsError("Konum servisi kapalı görünüyor.")
                return
            }

            manager.requestSingleUpdate(provider, object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    send(location)
                    manager.removeUpdates(this)
                }

                override fun onProviderEnabled(provider: String) {}

                override fun onProviderDisabled(provider: String) {}

                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }, Looper.getMainLooper())
        } catch (e: SecurityException) {
            notifyJsError("Konum izni yok.")
            return
        }

        Handler(Looper.getMainLooper()).postDelayed({
            if (!delivered.get()) {
                notifyJsError("Konum alınamadı. GPS'i açıp tekrar dene.")
            }
        }, 12_000L)
    }

    private fun notifyJsError(message: String) {
        val safe = message.replace("'", " ")
        webView.evaluateJavascript(
            "window.onNativeLocationError && window.onNativeLocationError('$safe')",
            null
        )
    }

    private inner class Bridge {
        @JavascriptInterface
        fun requestLocation() {
            runOnUiThread { startLocationUpdates() }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("AndroidBridge")
        webView.destroy()
        super.onDestroy()
    }
}
