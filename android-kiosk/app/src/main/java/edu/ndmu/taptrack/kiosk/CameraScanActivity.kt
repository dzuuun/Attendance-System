package edu.ndmu.taptrack.kiosk

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.Executors

/** Continuous barcode scanner that confirms every attendance submission in-camera. */
class CameraScanActivity : Activity() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var barcodeView: DecoratedBarcodeView
    private lateinit var feedbackPanel: LinearLayout
    private lateinit var feedbackPhoto: ImageView
    private lateinit var feedback: TextView
    private var processing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()
        barcodeView = DecoratedBarcodeView(this).apply {
            setDecoderFactory(DefaultDecoderFactory(BarcodeFormat.values().toList()))
            setStatusText("Point the camera at a TapTrack ID barcode")
        }
        feedbackPanel = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            setPadding(dp(18), dp(16), dp(22), dp(16))
            feedbackPhoto = ImageView(this@CameraScanActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                visibility = View.GONE
            }
            addView(feedbackPhoto, LinearLayout.LayoutParams(dp(72), dp(72)).apply { marginEnd = dp(14) })
            feedback = TextView(this@CameraScanActivity).apply {
                gravity = Gravity.CENTER_VERTICAL
                textSize = 16f
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 5
            }
            addView(feedback, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        val close = Button(this).apply {
            text = "Close camera"
            isAllCaps = false
            setTextColor(Color.WHITE)
            background = background(Color.argb(185, 0, 0, 0), 20)
            setOnClickListener { finish() }
        }
        setContentView(FrameLayout(this).apply {
            addView(barcodeView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(feedbackPanel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
                marginStart = dp(22); marginEnd = dp(22)
            })
            addView(close, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(46), Gravity.TOP or Gravity.END).apply {
                topMargin = dp(28); marginEnd = dp(16)
            })
        })
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startScanning()
        else requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
    }

    override fun onResume() {
        super.onResume()
        if (::barcodeView.isInitialized && !processing && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            barcodeView.resume()
    }

    override fun onPause() {
        if (::barcodeView.isInitialized) barcodeView.pause()
        super.onPause()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == CAMERA_PERMISSION_REQUEST && results.firstOrNull() == PackageManager.PERMISSION_GRANTED) startScanning()
        else if (requestCode == CAMERA_PERMISSION_REQUEST) showFeedback(
            ScanOutcome("CAMERA UNAVAILABLE\nAllow camera access to scan barcodes.", Color.rgb(178, 51, 45)),
            keepOpen = true,
        )
    }

    private fun startScanning() {
        barcodeView.decodeContinuous(object : BarcodeCallback {
            override fun barcodeResult(result: BarcodeResult) {
                val value = result.text?.trim().orEmpty()
                if (processing || value.isBlank()) return
                processing = true
                barcodeView.pause()
                recordAttendance(value)
            }
        })
        barcodeView.resume()
    }

    private fun recordAttendance(idNumber: String) {
        executor.execute {
            val outcome = runCatching {
                val response = requestScan(idNumber)
                val action = response.optString("action")
                val label = if (action == "Time Out") "TIME OUT RECORDED" else "TIME IN RECORDED"
                ScanOutcome(
                    "$label\n${response.optString("name", "Attendance recorded")}\n${response.optString("idNumber")}",
                    if (action == "Time Out") Color.rgb(174, 116, 8) else Color.rgb(9, 116, 73),
                    loadPhoto(response.optString("photoUrl")),
                )
            }.getOrElse { error ->
                ScanOutcome("NOT RECORDED\n${error.message ?: "Unable to record attendance."}", Color.rgb(178, 51, 45))
            }
            mainHandler.post { showFeedback(outcome) }
        }
    }

    private fun showFeedback(outcome: ScanOutcome, keepOpen: Boolean = false) {
        feedback.text = outcome.message
        feedback.setTextColor(Color.WHITE)
        feedbackPanel.background = background(outcome.backgroundColor, 18)
        if (outcome.photo != null) {
            feedbackPhoto.setImageBitmap(outcome.photo)
            feedbackPhoto.visibility = View.VISIBLE
        } else {
            feedbackPhoto.setImageDrawable(null)
            feedbackPhoto.visibility = View.GONE
        }
        feedbackPanel.visibility = View.VISIBLE
        if (!keepOpen) mainHandler.postDelayed({
            feedbackPanel.visibility = View.GONE
            processing = false
            barcodeView.resume()
        }, 2_000L)
    }

    private fun requestScan(idNumber: String): JSONObject {
        val server = intent.getStringExtra(EXTRA_SERVER).orEmpty()
        val kioskId = intent.getStringExtra(EXTRA_KIOSK_ID).orEmpty()
        val location = intent.getStringExtra(EXTRA_LOCATION).orEmpty()
        val token = intent.getStringExtra(EXTRA_KIOSK_TOKEN).orEmpty()
        val connection = (URL("$server/api/kiosk/scan").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (token.isNotBlank()) setRequestProperty("Authorization", "Kiosk $token")
            OutputStreamWriter(outputStream, Charsets.UTF_8).use {
                it.write(JSONObject().apply {
                    put("idNumber", idNumber.uppercase())
                    put("action", "Auto")
                    put("location", location)
                    put("kioskId", kioskId)
                }.toString())
            }
        }
        val code = connection.responseCode
        val payload = (if (code in 200..299) connection.inputStream else connection.errorStream)
            ?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        val data = runCatching { JSONObject(payload) }.getOrDefault(JSONObject())
        if (code !in 200..299) throw IllegalStateException(data.optString("message", "Server returned $code."))
        return data
    }

    private fun loadPhoto(photoUrl: String): Bitmap? {
        if (photoUrl.isBlank()) return null
        val server = intent.getStringExtra(EXTRA_SERVER).orEmpty()
        val token = intent.getStringExtra(EXTRA_KIOSK_TOKEN).orEmpty()
        val normalized = photoUrl.trim().replace('\\', '/')
        val candidates = buildList {
            runCatching { URI(normalized) }.getOrNull()?.takeIf { it.isAbsolute }?.let {
                runCatching { add(it.toURL()) }
            }
            // Resolve a relative server asset below its configured base path
            // (for example, http://host/attendance-system/), not at host root.
            runCatching { add(URL(URL("$server/"), normalized.removePrefix("/"))) }
        }.distinctBy { it.toString() }
        for (url in candidates) {
            val image = runCatching {
                val connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    setRequestProperty("Accept", "image/*")
                    if (token.isNotBlank()) setRequestProperty("Authorization", "Kiosk $token")
                }
                try {
                    if (connection.responseCode !in 200..299) null else BitmapFactory.decodeStream(connection.inputStream)
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()
            if (image != null) return image
        }
        return null
    }

    private fun background(color: Int, radiusDp: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radiusDp * resources.displayMetrics.density
    }

    companion object {
        const val EXTRA_SERVER = "server"
        const val EXTRA_KIOSK_ID = "kiosk_id"
        const val EXTRA_LOCATION = "location"
        const val EXTRA_KIOSK_TOKEN = "kiosk_token"
        private const val CAMERA_PERMISSION_REQUEST = 814
    }

    private data class ScanOutcome(
        val message: String,
        val backgroundColor: Int,
        val photo: Bitmap? = null,
    )
}
