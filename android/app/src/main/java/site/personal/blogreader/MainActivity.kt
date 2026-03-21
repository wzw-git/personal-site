package site.personal.blogreader

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * 博客 Web 壳：加载与网页端同一站点，共用服务端 API 与（WebView 内）localStorage。
 * 与手机 Chrome 的存储相互独立，需在 App 内重新登录方可与网页端账号一致。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar

    private val blogBase: String by lazy {
        BuildConfig.BLOG_WEB_URL.trim().trimEnd('/')
    }

    private val blogHost: String by lazy {
        Uri.parse(blogBase).host?.lowercase() ?: ""
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        refresh = findViewById(R.id.refresh)
        progress = findViewById(R.id.progress)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleUrl(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleUrl(Uri.parse(url))
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
                progress.isIndeterminate = true
            }

            override fun onPageFinished(view: WebView, url: String) {
                refresh.isRefreshing = false
                progress.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    refresh.isRefreshing = false
                    progress.visibility = View.GONE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (newProgress == 100) {
                    progress.visibility = View.GONE
                } else {
                    progress.visibility = View.VISIBLE
                    progress.isIndeterminate = false
                    progress.progress = newProgress
                }
            }
        }

        refresh.setColorSchemeResources(R.color.blog_accent)
        refresh.setOnRefreshListener { webView.reload() }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) webView.goBack()
                    else finish()
                }
            },
        )

        if (savedInstanceState == null) {
            webView.loadUrl(homeUrl())
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun homeUrl(): String = "$blogBase/"

    /** @return true 表示已消费导航（不交给 WebView） */
    private fun handleUrl(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "mailto" || scheme == "tel" || scheme == "geo") {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) { }
            return true
        }
        val host = uri.host?.lowercase() ?: return false
        if (host == blogHost) return false

        AlertDialog.Builder(this)
            .setTitle(R.string.external_link_title)
            .setMessage(uri.toString())
            .setPositiveButton(android.R.string.ok) { _, _ ->
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (_: Exception) { }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
        return true
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
