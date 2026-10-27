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
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var geoOrigin: String? = null
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var activeManager: LocationManager? = null
    private var activeListener: LocationListener? = null

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
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
            allowContentAccess = false
            setGeolocationEnabled(true)
            useWideViewPort = true
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = (resources.configuration.fontScale * 100).toInt().coerceIn(100, 200)
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url: Uri = request.url
                return when (url.scheme) {
                    "file" -> !url.toString().startsWith("file:///android_asset/")
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

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                Log.e("AdanaWeb", "Yükleme hatası: ${request.url} ${error.description}")
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) {
                    Log.d("AdanaJS", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                }
                return true
            }

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
                    requestLocationPermission()
                }
            }
        }

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView.addJavascriptInterface(Bridge(), "AndroidBridge")
        webView.loadUrl("file:///android_asset/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun requestLocationPermission() {
        locationPermission.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun stopLocationUpdates() {
        val manager = activeManager
        val listener = activeListener
        if (manager != null && listener != null) {
            try {
                manager.removeUpdates(listener)
            } catch (e: SecurityException) {
                Log.w("AdanaLoc", "removeUpdates: ${e.message}")
            }
        }
        activeManager = null
        activeListener = null
    }

    private fun startLocationUpdates() {
        if (!hasLocationPermission()) {
            requestLocationPermission()
            return
        }
        val manager = getSystemService(LOCATION_SERVICE) as? LocationManager
        if (manager == null) {
            notifyJsError("Konum servisi bulunamadı.")
            return
        }

        stopLocationUpdates()
        val delivered = AtomicBoolean(false)

        fun send(location: Location) {
            if (!delivered.compareAndSet(false, true)) return
            stopLocationUpdates()
            webView.evaluateJavascript(
                "window.onNativeLocation && window.onNativeLocation(${location.latitude}, ${location.longitude})",
                null
            )
        }

        try {
            val now = System.currentTimeMillis()
            val candidates = listOfNotNull(
                manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER),
                manager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ).filter { now - it.time in 0..300_000L }
            val freshest = candidates.maxByOrNull { it.time }
            if (freshest != null) {
                send(freshest)
                return
            }

            val providers = listOf(
                LocationManager.NETWORK_PROVIDER,
                LocationManager.GPS_PROVIDER
            ).filter { manager.isProviderEnabled(it) }
            if (providers.isEmpty()) {
                notifyJsError("Konum servisi kapalı görünüyor. Ayarlardan konumu açın.")
                return
            }

            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    send(location)
                }

                override fun onProviderEnabled(provider: String) {}

                override fun onProviderDisabled(provider: String) {}

                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }
            activeManager = manager
            activeListener = listener
            providers.forEach { provider ->
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
            }
        } catch (e: SecurityException) {
            stopLocationUpdates()
            notifyJsError("Konum izni yok.")
            return
        } catch (e: Exception) {
            stopLocationUpdates()
            notifyJsError("Konum servisi başlatılamadı.")
            Log.e("AdanaLoc", "Konum hatası", e)
            return
        }

        Handler(Looper.getMainLooper()).postDelayed({
            if (!delivered.get()) {
                stopLocationUpdates()
                notifyJsError("Konum alınamadı. Açık alanda veya Wi-Fi açıkken tekrar deneyin.")
            }
        }, 20_000L)
    }

    private fun notifyJsError(message: String) {
        val safe = org.json.JSONObject.quote(message)
        webView.evaluateJavascript(
            "window.onNativeLocationError && window.onNativeLocationError($safe)",
            null
        )
    }

    private inner class Bridge {
        @JavascriptInterface
        fun requestLocation() {
            runOnUiThread { startLocationUpdates() }
        }

        @JavascriptInterface
        fun appVersion(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun share(text: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(intent, "Paylaş"))
            }
        }
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
        stopLocationUpdates()
        webView.removeJavascriptInterface("AndroidBridge")
        webView.destroy()
        super.onDestroy()
    }
}
