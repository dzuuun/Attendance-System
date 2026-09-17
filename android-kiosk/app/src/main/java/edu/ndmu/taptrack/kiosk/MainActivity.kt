package edu.ndmu.taptrack.kiosk

import android.animation.ObjectAnimator
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.MifareClassic
import android.nfc.tech.NfcA
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.ArrayAdapter
import android.widget.BaseAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import com.google.zxing.integration.android.IntentIntegrator
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.time.Instant
import java.nio.charset.StandardCharsets
import java.util.UUID

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val preferences by lazy { getSharedPreferences("taptrack_kiosk", Context.MODE_PRIVATE) }

    private lateinit var idInput: EditText
    private lateinit var gateSpinner: Spinner
    private lateinit var assignedGateText: TextView
    private lateinit var clockText: TextView
    private lateinit var dateText: TextView
    private lateinit var scanButton: Button
    private lateinit var cameraButton: Button
    private lateinit var resultTitle: TextView
    private lateinit var resultDetail: TextView
    private lateinit var resultPhoto: ImageView
    private lateinit var resultPanel: LinearLayout
    private lateinit var resultIcon: TextView
    private lateinit var attendeeDetails: LinearLayout
    private lateinit var previousLogNotice: TextView
    private lateinit var resetProgress: ProgressBar
    private lateinit var statusPill: TextView
    private lateinit var nfcStatus: TextView
    private lateinit var progress: ProgressBar
    private var gates: List<Gate> = emptyList()
    private var isScanning = false
    private var resultReset: Runnable? = null
    private var resetAnimator: ObjectAnimator? = null
    private val recentlyAccepted = mutableMapOf<String, Long>()
    private val nfcAdapter: NfcAdapter? by lazy { NfcAdapter.getDefaultAdapter(this) }
    private var kioskEnabled = true
    private val kioskId: String by lazy {
        preferences.getString("kiosk_id", null) ?: UUID.randomUUID().toString().also {
            preferences.edit().putString("kiosk_id", it).apply()
        }
    }
    private val kioskHeartbeat = object : Runnable {
        override fun run() {
            val gate = (gateSpinner.adapter as? GateSpinnerAdapter)?.gateAt(gateSpinner.selectedItemPosition)
            val server = baseUrl()
            if (gate != null && server.isNotBlank()) executor.execute {
                runCatching {
                    request("POST", "$server/api/kiosk/heartbeat", JSONObject().apply {
                        put("kioskId", kioskId)
                        put("type", "entrance")
                        put("location", gate.location)
                        put("name", Build.MODEL)
                        put("browserStatus", "Online")
                        put("currentPage", "/kiosk/entrance (Android native)")
                        put("uptimeSeconds", SystemClock.elapsedRealtime() / 1_000L)
                    }) as JSONObject
                }.onSuccess { data ->
                    kioskEnabled = data.optBoolean("enabled", true)
                    if (!kioskEnabled) mainHandler.post {
                        showFailure("This kiosk has been disabled by central management.")
                    }
                    pollBrowserCommands(server)
                }
            }
            mainHandler.postDelayed(this, 90_000L)
        }
    }
    private val clockUpdater = object : Runnable {
        override fun run() {
            val now = Date()
            clockText.text = SimpleDateFormat("hh:mm:ss a", Locale.US).format(now)
            val datePattern = if (resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT) "EEE, MMM d, yyyy" else "EEEE, MMMM d, yyyy"
            dateText.text = SimpleDateFormat(datePattern, Locale.US).format(now)
            mainHandler.postDelayed(this, 1_000L)
        }
    }

    data class Gate(val id: Int, val name: String, val campus: String) {
        val location: String get() = "$name — $campus"
        override fun toString(): String = location
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER
            }
        }
        setContentView(buildScreen())
        clockUpdater.run()
        loadGates()
        mainHandler.postDelayed(kioskHeartbeat, 2_000L)
    }

    override fun onResume() {
        super.onResume()
        val adapter = nfcAdapter
        if (adapter == null) {
            nfcStatus.text = "NFC is not available on this device."
            return
        }
        if (!adapter.isEnabled) {
            nfcStatus.text = "Turn on NFC to scan TapTrack cards."
            return
        }
        nfcStatus.text = "Native NFC ready — tap a TapTrack card."
        adapter.enableReaderMode(
            this,
            { tag -> readTapTrackCard(tag) },
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            null,
        )
    }

    override fun onPause() {
        nfcAdapter?.disableReaderMode(this)
        super.onPause()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(clockUpdater)
        mainHandler.removeCallbacks(kioskHeartbeat)
        resultReset?.let(mainHandler::removeCallbacks)
        resetAnimator?.cancel()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildScreen(): View {
        fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
        val isPortrait = resources.configuration.orientation == Configuration.ORIENTATION_PORTRAIT
        lateinit var drawer: LinearLayout
        lateinit var scrim: View
        lateinit var hamburgerButton: ImageButton
        fun closeDrawer() {
            hamburgerButton.animate().rotation(0f).setDuration(220L).start()
            drawer.animate()
                .translationX(-drawer.width.toFloat())
                .alpha(0.9f)
                .setDuration(240L)
                .withEndAction { drawer.visibility = View.GONE }
                .start()
            scrim.animate()
                .alpha(0f)
                .setDuration(220L)
                .withEndAction { scrim.visibility = View.GONE }
                .start()
        }
        fun openDrawer() {
            hamburgerButton.animate().rotation(90f).setDuration(220L).start()
            scrim.alpha = 0f
            scrim.visibility = View.VISIBLE
            scrim.animate().alpha(1f).setDuration(220L).start()
            drawer.alpha = 0.9f
            drawer.visibility = View.VISIBLE
            drawer.bringToFront()
            drawer.post {
                drawer.translationX = -drawer.width.toFloat()
                drawer.animate().translationX(0f).alpha(1f).setDuration(260L).start()
            }
        }
        fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
            this.text = value
            textSize = size
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }
        fun button(label: String) = Button(this).apply {
            text = label
            isAllCaps = false
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            background = roundedBackground(Color.rgb(8, 139, 91), 12)
            minHeight = dp(50)
            elevation = dp(2).toFloat()
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(4, 59, 42))
            setPadding(dp(if (isPortrait) 16 else 30), dp(if (isPortrait) 70 else 24), dp(if (isPortrait) 16 else 30), dp(24))

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                hamburgerButton = ImageButton(this@MainActivity).apply {
                    setImageResource(R.drawable.ic_menu)
                    scaleType = ImageView.ScaleType.CENTER
                    setPadding(0, 0, 0, 0)
                    background = roundedBackground(Color.TRANSPARENT, 10, Color.rgb(104, 168, 139), 1)
                    contentDescription = "Open settings menu"
                    setOnClickListener { openDrawer() }
                }
                addView(hamburgerButton, LinearLayout.LayoutParams(dp(48), dp(44)).apply { marginEnd = dp(10) })
                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    addView(ImageView(this@MainActivity).apply {
                        setImageResource(R.drawable.ndmu_logo)
                        scaleType = ImageView.ScaleType.CENTER_INSIDE
                        contentDescription = "Notre Dame of Marbel University logo"
                    }, LinearLayout.LayoutParams(dp(if (isPortrait) 52 else 58), dp(if (isPortrait) 52 else 58)).apply {
                        marginEnd = dp(12)
                    })
                    addView(LinearLayout(this@MainActivity).apply {
                        orientation = LinearLayout.VERTICAL
                        addView(text("NOTRE DAME OF MARBEL UNIVERSITY", if (isPortrait) 16f else 18f, Color.WHITE, true))
                        addView(text("TAPTRACK · UNIVERSITY ENTRANCE", 11f, Color.rgb(182, 217, 199), true))
                    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            })

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(18), dp(16), dp(18), dp(16))
                background = roundedBackground(Color.rgb(5, 72, 51), 18, Color.rgb(35, 113, 84), 1)

                clockText = text("--:--:-- --", if (isPortrait) 26f else 42f, Color.WHITE, true)
                addView(clockText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.END
                    dateText = text("", 12f, Color.WHITE, true).apply { gravity = Gravity.END }
                    addView(dateText)
                    assignedGateText = text("NOT CONFIGURED", 11f, Color.rgb(166, 226, 199), true).apply {
                        gravity = Gravity.CENTER
                        setPadding(dp(12), dp(5), dp(12), dp(5))
                        background = roundedBackground(Color.rgb(18, 101, 73), 20)
                    }
                    addView(assignedGateText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        topMargin = dp(8)
                        gravity = Gravity.END
                    })
                })
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(16)
            })

            val panels = LinearLayout(this@MainActivity).apply {
                orientation = if (isPortrait) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
                setPadding(0, dp(18), 0, 0)
                if (isPortrait) {
                    addView(buildInputPanel({ dp(it) }, { v, s, c, b -> text(v, s, c, b) }, { button(it) }), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
                    addView(buildResultPanel({ dp(it) }, { v, s, c, b -> text(v, s, c, b) }), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply { topMargin = dp(12) })
                } else {
                    addView(buildInputPanel({ dp(it) }, { v, s, c, b -> text(v, s, c, b) }, { button(it) }), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 0.47f).apply { marginEnd = dp(20) })
                    addView(buildResultPanel({ dp(it) }, { v, s, c, b -> text(v, s, c, b) }), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 0.53f))
                }
            }
            addView(panels, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        }

        scrim = View(this).apply {
            setBackgroundColor(Color.argb(150, 0, 20, 13))
            visibility = View.GONE
            setOnClickListener { closeDrawer() }
        }
        drawer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(30), dp(22), dp(24))
            background = roundedBackground(Color.rgb(248, 251, 249), 0)
            elevation = dp(16).toFloat()
            visibility = View.GONE

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(ImageView(this@MainActivity).apply {
                    setImageResource(R.drawable.ndmu_logo)
                    scaleType = ImageView.ScaleType.CENTER_INSIDE
                    contentDescription = "Notre Dame of Marbel University logo"
                }, LinearLayout.LayoutParams(dp(52), dp(52)).apply { marginEnd = dp(12) })
                addView(text("TAPTRACK\nEntrance Kiosk", 16f, Color.rgb(21, 57, 45), true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(Button(this@MainActivity).apply {
                    text = "×"
                    textSize = 24f
                    isAllCaps = false
                    setTextColor(Color.rgb(21, 57, 45))
                    background = roundedBackground(Color.TRANSPARENT, 20)
                    contentDescription = "Close settings menu"
                    setOnClickListener { closeDrawer() }
                }, LinearLayout.LayoutParams(dp(44), dp(44)))
            })

            addView(text("TERMINAL", 11f, Color.rgb(89, 114, 103), true).apply {
                setPadding(0, dp(30), 0, dp(8))
            })
            addView(Button(this@MainActivity).apply {
                text = "Server settings"
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                isAllCaps = false
                textSize = 15f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.rgb(7, 92, 59))
                setPadding(dp(16), 0, dp(16), 0)
                background = roundedBackground(Color.rgb(228, 244, 236), 12)
                setOnClickListener {
                    closeDrawer()
                    showServerSettings()
                }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54)))

            addView(text("ASSIGNED GATE", 11f, Color.rgb(89, 114, 103), true).apply {
                setPadding(0, dp(26), 0, dp(8))
            })
            gateSpinner = Spinner(this@MainActivity).apply {
                background = roundedBackground(Color.rgb(10, 70, 52), 10, Color.rgb(69, 130, 107), 1)
                adapter = ArrayAdapter(
                    this@MainActivity,
                    android.R.layout.simple_spinner_dropdown_item,
                    listOf("Configure server settings first"),
                )
            }
            addView(gateSpinner, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)))

            addView(text("Configure the TapTrack server used to load gates, profile photos, and record attendance.", 13f, Color.rgb(89, 114, 103), false).apply {
                setPadding(dp(4), dp(14), dp(4), 0)
            })
        }

        return FrameLayout(this).apply {
            addView(content, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(scrim, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            addView(drawer, FrameLayout.LayoutParams(dp(if (isPortrait) 300 else 340), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.START))
        }
    }

    private fun buildInputPanel(
        dp: (Int) -> Int,
        text: (String, Float, Int, Boolean) -> TextView,
        button: (String) -> Button,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = roundedBackground(Color.rgb(9, 78, 57), 18, Color.rgb(29, 105, 78), 1)
        elevation = dp(3).toFloat()
        setPadding(dp(18), dp(14), dp(18), dp(14))
        addView(text("ENTRANCE TERMINAL", 12f, Color.rgb(177, 226, 198), true))
        addView(text("Ready to Scan", 24f, Color.WHITE, true).apply { setPadding(0, dp(2), 0, dp(2)) })
        addView(text("Scan or enter an ID number.", 12f, Color.rgb(205, 230, 215), false))

        addView(text("MANUAL ID ENTRY / SCANNER BUFFER", 10f, Color.rgb(177, 226, 198), true).apply { setPadding(0, dp(10), 0, dp(4)) })
        idInput = EditText(this@MainActivity).apply {
            hint = "Scan or enter ID number"
            setSingleLine(true)
            imeOptions = EditorInfo.IME_ACTION_DONE
            inputType = InputType.TYPE_CLASS_TEXT
            background = roundedBackground(Color.rgb(248, 251, 249), 10, Color.rgb(205, 222, 213), 1)
            setPadding(dp(14), 0, dp(14), 0)
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submitScan(idInput.text.toString())
                    true
                } else false
            }
        }
        addView(idInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(46)))

        scanButton = button("Record attendance")
        scanButton.setOnClickListener { submitScan(idInput.text.toString()) }
        addView(scanButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(46)).apply { topMargin = dp(8) })
        cameraButton = button("Scan barcode with camera")
        cameraButton.background = roundedBackground(Color.rgb(6, 94, 63), 12, Color.rgb(32, 145, 101), 1)
        cameraButton.setOnClickListener { openCameraScanner() }
        addView(cameraButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44)).apply { topMargin = dp(6) })
        nfcStatus = text("Checking NFC…", 12f, Color.rgb(177, 226, 198), false).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }
        addView(nfcStatus, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    private fun buildResultPanel(
        dp: (Int) -> Int,
        text: (String, Float, Int, Boolean) -> TextView,
    ): LinearLayout = LinearLayout(this).apply {
        resultPanel = this
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        background = roundedBackground(Color.WHITE, 18)
        elevation = dp(3).toFloat()
        minimumHeight = dp(220)
        setPadding(dp(20), dp(16), dp(20), dp(16))
        resultIcon = text("◎", 34f, Color.rgb(7, 112, 73), true).apply {
            gravity = Gravity.CENTER
        }
        addView(resultIcon, LinearLayout.LayoutParams(dp(42), dp(42)).apply { bottomMargin = dp(6) })
        addView(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            resultPhoto = ImageView(this@MainActivity).apply {
                visibility = View.GONE
                scaleType = ImageView.ScaleType.FIT_CENTER
                adjustViewBounds = true
                setPadding(dp(2), dp(2), dp(2), dp(2))
                background = roundedBackground(Color.rgb(232, 241, 236), 8, Color.rgb(8, 139, 91), 2)
                clipToOutline = false
                contentDescription = "Scanned user's profile photo"
            }
            addView(resultPhoto, LinearLayout.LayoutParams(dp(96), dp(120)).apply { marginEnd = dp(14) })
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                statusPill = text("SYSTEM READY", 11f, Color.rgb(7, 112, 73), true).apply {
                    gravity = Gravity.CENTER
                    setPadding(dp(14), dp(6), dp(14), dp(6))
                    background = roundedBackground(Color.rgb(228, 244, 236), 20)
                }
                addView(statusPill, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
                resultTitle = text("Ready to Scan", 24f, Color.rgb(21, 57, 45), true).apply {
                    gravity = Gravity.CENTER
                    setPadding(0, dp(8), 0, dp(3))
                }
                addView(resultTitle, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
                resultDetail = text("The scanned student or employee will appear here.", 14f, Color.rgb(95, 118, 108), false).apply { gravity = Gravity.CENTER }
                addView(resultDetail, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        attendeeDetails = LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
        }
        addView(attendeeDetails, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
        previousLogNotice = text("", 13f, Color.rgb(91, 77, 31), false).apply {
            visibility = View.GONE
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = roundedBackground(Color.rgb(254, 248, 226), 10, Color.rgb(231, 204, 112), 1)
        }
        addView(previousLogNotice, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) })
        resetProgress = ProgressBar(this@MainActivity, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 100
            visibility = View.GONE
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(8, 139, 91))
        }
        addView(resetProgress, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(4)).apply { topMargin = dp(14) })
        progress = ProgressBar(this@MainActivity).apply { visibility = ProgressBar.GONE }
        addView(progress, LinearLayout.LayoutParams(dp(42), dp(42)).apply { topMargin = dp(20) })
    }

    private fun roundedBackground(color: Int, radiusDp: Int, strokeColor: Int? = null, strokeDp: Int = 0) =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(color)
            cornerRadius = radiusDp * resources.displayMetrics.density
            if (strokeColor != null && strokeDp > 0)
                setStroke((strokeDp * resources.displayMetrics.density).toInt(), strokeColor)
        }

    private fun showServerSettings() {
        val input = EditText(this).apply {
            hint = "http://server-ip:4000"
            setText(baseUrl())
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
        }
        AlertDialog.Builder(this)
            .setTitle("TapTrack server URL")
            .setMessage("Use the internal server URL. HTTPS is preferred, but HTTP is supported for the university network.")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                preferences.edit().putString("server_url", normalizeUrl(input.text.toString())).apply()
                loadGates()
            }
            .show()
    }

    private fun baseUrl(): String = preferences.getString("server_url", "") ?: ""
    private fun normalizeUrl(value: String) = value.trim().trimEnd('/')

    private fun loadGates() {
        val server = baseUrl()
        if (server.isBlank()) {
            showGateMessage("Configure server settings first")
            showIdle("Configure the server URL to load available gates.")
            return
        }
        showGateMessage("Loading gates…")
        setLoading(true)
        executor.execute {
            try {
                val gateArray = request("GET", "$server/api/kiosk/gates") as JSONArray
                gates = buildList {
                    for (index in 0 until gateArray.length()) {
                        val item = gateArray.getJSONObject(index)
                        add(Gate(item.getInt("id"), item.getString("name"), item.getString("campus")))
                    }
                }
                mainHandler.post {
                    val gateAdapter = GateSpinnerAdapter(this, gates)
                    gateSpinner.adapter = gateAdapter
                    gateSpinner.setOnTouchListener(null)
                    val savedGate = preferences.getInt("gate_id", -1)
                    gateSpinner.setSelection(gateAdapter.positionOfGate(savedGate))
                    gateSpinner.isEnabled = gates.isNotEmpty()
                    gateAdapter.gateAt(gateSpinner.selectedItemPosition)?.let {
                        assignedGateText.text = it.location.uppercase(Locale.US)
                    }
                    gateSpinner.onItemSelectedListener = SimpleItemSelectedListener { position ->
                        gateAdapter.gateAt(position)?.let {
                            preferences.edit().putInt("gate_id", it.id).apply()
                            assignedGateText.text = it.location.uppercase(Locale.US)
                            showIdle("Ready to record attendance at ${it.location}.")
                        }
                    }
                    setLoading(false)
                    val selectedGate = gateAdapter.gateAt(gateSpinner.selectedItemPosition)
                    if (selectedGate == null)
                        showIdle("No active gates. Add one in TapTrack Maintenance.")
                    else
                        showIdle("Ready to record attendance at ${selectedGate.location}.")
                    idInput.requestFocus()
                }
            } catch (error: Exception) {
                mainHandler.post {
                    showGateMessage("Unable to load gates — check server settings")
                    setLoading(false)
                    showFailure(error.message ?: "Unable to load gates.")
                }
            }
        }
    }

    private fun pollBrowserCommands(server: String) {
        runCatching {
            request("POST", "$server/api/kiosk/commands/poll", JSONObject().apply {
                put("kioskId", kioskId)
                put("channel", "browser")
            }) as JSONObject
        }.onSuccess { response ->
            val commands = response.optJSONArray("commands") ?: return@onSuccess
            for (index in 0 until commands.length()) {
                val command = commands.getJSONObject(index)
                val id = command.getLong("id")
                val status: String
                val result: String
                when (command.optString("command")) {
                    "reload" -> {
                        mainHandler.post { loadGates() }
                        status = "Completed"; result = "Android kiosk reloaded its attendance configuration."
                    }
                    else -> { status = "Unsupported"; result = "This command is not supported by the Android kiosk app." }
                }
                runCatching {
                    request("POST", "$server/api/kiosk/commands/complete", JSONObject().apply {
                        put("kioskId", kioskId); put("commandId", id); put("status", status); put("resultText", result)
                    })
                }
            }
        }
    }

    private fun showGateMessage(message: String) {
        gates = emptyList()
        assignedGateText.text = when {
            message.startsWith("Loading") -> "LOADING GATE…"
            message.startsWith("Unable") -> "GATE UNAVAILABLE"
            else -> "NOT CONFIGURED"
        }
        gateSpinner.onItemSelectedListener = null
        gateSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            listOf(message),
        )
        gateSpinner.isEnabled = true
        gateSpinner.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) showServerSettings()
            true
        }
    }

    private fun submitScan(rawId: String) {
        val idNumber = rawId.trim().uppercase(Locale.US)
        val gate = (gateSpinner.adapter as? GateSpinnerAdapter)?.gateAt(gateSpinner.selectedItemPosition)
        if (idNumber.isBlank()) { showFailure("Enter or scan an ID number."); return }
        if (!kioskEnabled) { showFailure("This kiosk has been disabled by central management."); return }
        if (gate == null) { showFailure("Select an assigned gate first."); return }
        val previous = recentlyAccepted[idNumber] ?: 0L
        if (System.currentTimeMillis() - previous < 5_000L) return
        if (isScanning) return
        isScanning = true
        setLoading(true)
        executor.execute {
            try {
                val body = JSONObject().apply {
                    put("idNumber", idNumber)
                    put("action", "Auto")
                    put("location", gate.location)
                    put("kioskId", kioskId)
                }
                val response = request("POST", "${baseUrl()}/api/kiosk/scan", body) as JSONObject
                val photo = loadPhoto(response.optString("photoUrl"))
                recentlyAccepted[idNumber] = System.currentTimeMillis()
                mainHandler.post {
                    idInput.text.clear()
                    showSuccess(response, photo)
                    idInput.requestFocus()
                }
            } catch (error: Exception) {
                mainHandler.post { showFailure(error.message ?: "Scan not recorded."); idInput.requestFocus() }
            } finally {
                mainHandler.post { isScanning = false; setLoading(false) }
            }
        }
    }

    private fun request(method: String, endpoint: String, body: JSONObject? = null): Any {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 12_000
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                OutputStreamWriter(outputStream, Charsets.UTF_8).use { it.write(body.toString()) }
            }
        }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (code !in 200..299) {
            val message = runCatching { JSONObject(payload).optString("message") }.getOrDefault("")
            throw IllegalStateException(message.ifBlank { "Server returned $code." })
        }
        return if (payload.trim().startsWith("[")) JSONArray(payload) else JSONObject(payload)
    }

    private fun loadPhoto(photoUrl: String): Bitmap? {
        if (photoUrl.isBlank()) return null
        val normalized = photoUrl.trim().replace('\\', '/')
        val candidates = buildList {
            val path = runCatching { URI(normalized).rawPath }.getOrNull()
            if (!path.isNullOrBlank()) add(URL(URL("${baseUrl()}/"), path))
            runCatching { add(URL(URL("${baseUrl()}/"), normalized)) }
        }.distinctBy { it.toString() }

        for (resolvedUrl in candidates) {
            val bitmap = runCatching {
                val connection = (resolvedUrl.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    instanceFollowRedirects = true
                    setRequestProperty("Accept", "image/*")
                    setRequestProperty("Cache-Control", "no-cache")
                }
                try {
                    if (connection.responseCode !in 200..299) return@runCatching null
                    BitmapFactory.decodeStream(connection.inputStream)
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()
            if (bitmap != null) return bitmap
        }
        return null
    }

    private fun showSuccess(data: JSONObject, photo: Bitmap?) {
        val isTimeOut = data.optString("action") == "Time Out"
        if (photo != null) resultPhoto.setImageBitmap(photo) else resultPhoto.setImageResource(R.drawable.ndmu_logo)
        resultPhoto.visibility = View.VISIBLE
        resultIcon.visibility = View.GONE
        resultPanel.background = roundedBackground(if (isTimeOut) Color.rgb(255, 249, 230) else Color.WHITE, 18, if (isTimeOut) Color.rgb(226, 183, 57) else Color.rgb(72, 174, 122), 2)
        statusPill.text = if (isTimeOut) "TIME OUT RECORDED" else "TIME IN RECORDED"
        statusPill.setTextColor(if (isTimeOut) Color.rgb(139, 91, 8) else Color.rgb(7, 112, 73))
        statusPill.background = roundedBackground(if (isTimeOut) Color.rgb(255, 238, 183) else Color.rgb(228, 244, 236), 20)
        resultTitle.text = data.optString("name", "Attendance recorded")
        val timestamp = data.optString("timestamp")
        resultDetail.text = listOf(data.optString("idNumber"), data.optString("type"), "Recorded ${formatTimestamp(timestamp)}").filter { it.isNotBlank() }.joinToString(" · ")

        attendeeDetails.removeAllViews()
        addAttendeeDetail("ATTENDEE TYPE", data.optString("type", "Attendee"))
        if (data.optString("type") == "Student") {
            addAttendeeDetail("PROGRAM", data.optString("programCode").ifBlank { "Not specified" })
            addAttendeeDetail("YEAR LEVEL", data.optString("yearLevel").ifBlank { "Not specified" })
        } else {
            addAttendeeDetail("DEPARTMENT / OFFICE", data.optString("department").ifBlank { "Not specified" })
        }
        attendeeDetails.visibility = View.VISIBLE

        val previousAction = jsonText(data, "previousAction")
        val previousTimestamp = jsonText(data, "previousTimestamp")
        if (previousAction.isNotBlank()) {
            previousLogNotice.text = "↶  Previous: $previousAction${if (previousTimestamp.isBlank()) "" else " · ${formatTimestamp(previousTimestamp)}"}"
            previousLogNotice.visibility = View.VISIBLE
        } else previousLogNotice.visibility = View.GONE

        animateResultEntrance()
        scheduleResultReset(30_000L)
    }

    private fun jsonText(data: JSONObject, key: String): String {
        if (!data.has(key) || data.isNull(key)) return ""
        return data.optString(key).trim().takeUnless { it.equals("null", ignoreCase = true) }.orEmpty()
    }

    private fun showFailure(message: String) {
        resultPhoto.setImageDrawable(null)
        resultPhoto.visibility = View.GONE
        resultIcon.text = "!"
        resultIcon.setTextColor(Color.rgb(185, 47, 40))
        resultIcon.visibility = View.VISIBLE
        resultPanel.background = roundedBackground(Color.rgb(255, 246, 245), 18, Color.rgb(217, 56, 56), 2)
        statusPill.text = "ATTENTION REQUIRED"
        statusPill.setTextColor(Color.rgb(168, 41, 31))
        statusPill.background = roundedBackground(Color.rgb(253, 232, 230), 20)
        resultTitle.text = "Unable to Record"
        resultDetail.text = message
        attendeeDetails.visibility = View.GONE
        previousLogNotice.visibility = View.GONE
        animateResultShake()
        scheduleResultReset(5_000L)
    }

    private fun showIdle(message: String) {
        resultReset?.let(mainHandler::removeCallbacks)
        resultReset = null
        resultPhoto.setImageDrawable(null)
        resultPhoto.visibility = View.GONE
        resultIcon.text = "◎"
        resultIcon.setTextColor(Color.rgb(7, 112, 73))
        resultIcon.visibility = View.VISIBLE
        resultPanel.background = roundedBackground(Color.WHITE, 18)
        statusPill.text = "SYSTEM READY"
        statusPill.setTextColor(Color.rgb(7, 112, 73))
        statusPill.background = roundedBackground(Color.rgb(228, 244, 236), 20)
        resultTitle.text = "Ready to Scan"
        resultDetail.text = message
        attendeeDetails.removeAllViews()
        attendeeDetails.visibility = View.GONE
        previousLogNotice.visibility = View.GONE
        resetProgress.visibility = View.GONE
        resetAnimator?.cancel()
    }

    private fun addAttendeeDetail(label: String, value: String) {
        val density = resources.displayMetrics.density
        attendeeDetails.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((14 * density).toInt(), (10 * density).toInt(), (14 * density).toInt(), (10 * density).toInt())
            background = roundedBackground(Color.rgb(242, 248, 245), 10)
            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.rgb(91, 119, 106))
            })
            addView(TextView(this@MainActivity).apply {
                text = value
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.rgb(21, 57, 45))
            })
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = (4 * density).toInt()
        })
    }

    private fun animateResultEntrance() {
        resultPanel.alpha = 0f
        resultPanel.scaleX = 0.96f
        resultPanel.scaleY = 0.96f
        resultPanel.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(380L).start()
    }

    private fun animateResultShake() {
        ObjectAnimator.ofFloat(resultPanel, View.TRANSLATION_X, 0f, -12f, 12f, -9f, 9f, -5f, 5f, 0f).apply {
            duration = 500L
            start()
        }
    }

    private fun scheduleResultReset(delayMs: Long) {
        resultReset?.let(mainHandler::removeCallbacks)
        resetAnimator?.cancel()
        resetProgress.visibility = View.VISIBLE
        resetProgress.progress = 100
        resetAnimator = ObjectAnimator.ofInt(resetProgress, "progress", 100, 0).apply {
            duration = delayMs
            interpolator = LinearInterpolator()
            start()
        }
        resultReset = Runnable {
            resultReset = null
            val gate = (gateSpinner.adapter as? GateSpinnerAdapter)
                ?.gateAt(gateSpinner.selectedItemPosition)
            showIdle(
                when {
                    baseUrl().isBlank() -> "Configure the server URL to load available gates."
                    gate != null -> "Ready to record attendance at ${gate.location}."
                    else -> "Select an assigned gate to begin scanning."
                },
            )
        }.also { mainHandler.postDelayed(it, delayMs) }
    }

    private fun setLoading(loading: Boolean) {
        progress.visibility = if (loading) ProgressBar.VISIBLE else ProgressBar.GONE
        scanButton.isEnabled = !loading
        cameraButton.isEnabled = !loading
    }

    private fun formatTimestamp(value: String): String = runCatching {
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date.from(Instant.parse(value)))
    }.getOrDefault(value)

    private fun openCameraScanner() {
        if (!packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_ANY)) {
            showFailure("This device does not have an available camera.")
            return
        }
        runCatching {
            IntentIntegrator(this).apply {
                captureActivity = PortraitCaptureActivity::class.java
                setDesiredBarcodeFormats(IntentIntegrator.ALL_CODE_TYPES)
                setPrompt("Scan TapTrack ID barcode")
                setBeepEnabled(true)
                setOrientationLocked(true)
                initiateScan()
            }
        }.onFailure { error ->
            showFailure(error.message ?: "Unable to open the barcode camera.")
        }
    }

    private fun readTapTrackCard(tag: Tag) {
        try {
            // TapTrack supports both its original NTAG Type 2 layout (pages 4-7)
            // and MIFARE Classic cards (sector 1, block 4, factory key).
            val raw = MifareClassic.get(tag)?.let(::readMifareClassicCard)
                ?: readType2Card(tag)
            val idNumber = decodeCardIdentifier(raw)
            mainHandler.post { submitScan(idNumber) }
        } catch (error: Exception) {
            mainHandler.post {
                showFailure(error.message ?: "Unable to read the NFC card.")
                idInput.requestFocus()
            }
        }
    }

    private fun readType2Card(tag: Tag): ByteArray {
        val technology = NfcA.get(tag)
            ?: throw IllegalStateException("This is not a supported TapTrack NFC card.")
        return try {
            technology.connect()
            technology.transceive(byteArrayOf(0x30, 0x04))
        } finally {
            runCatching { technology.close() }
        }
    }

    private fun readMifareClassicCard(technology: MifareClassic): ByteArray {
        if (technology.size < MifareClassic.SIZE_1K)
            throw IllegalStateException("This MIFARE card does not have enough memory.")
        return try {
            technology.connect()
            val sector = MIFARE_CLASSIC_SECTOR
            val authenticated = technology.authenticateSectorWithKeyA(sector, MifareClassic.KEY_DEFAULT) ||
                technology.authenticateSectorWithKeyB(sector, MifareClassic.KEY_DEFAULT)
            if (!authenticated)
                throw IllegalStateException("This MIFARE card is protected or was not enrolled by TapTrack.")
            technology.readBlock(technology.sectorToBlock(sector))
        } finally {
            runCatching { technology.close() }
        }
    }

    private fun decodeCardIdentifier(raw: ByteArray): String {
            val end = raw.indexOfFirst { value -> value == 0.toByte() || value == 0xFF.toByte() }
                .let { if (it < 0) raw.size else it }
            val idNumber = String(raw.copyOf(end), StandardCharsets.US_ASCII).trim().uppercase(Locale.US)
            if (!idNumber.matches(Regex("^(?:\\d{7,8}|\\d{12}|P\\d{7,8})$")))
                throw IllegalStateException("This card does not contain a valid TapTrack ID.")
            return idNumber
    }

    companion object {
        private const val MIFARE_CLASSIC_SECTOR = 1
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        val result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data)
        if (result != null) {
            result.contents?.let { submitScan(it) }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_ENTER && idInput.hasFocus()) {
            submitScan(idInput.text.toString())
            return true
        }
        if (event.action == KeyEvent.ACTION_DOWN && event.unicodeChar != 0 && !idInput.hasFocus()) {
            idInput.requestFocus()
        }
        return super.dispatchKeyEvent(event)
    }
}

private class SimpleItemSelectedListener(private val selected: (Int) -> Unit) : android.widget.AdapterView.OnItemSelectedListener {
    override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: android.view.View?, position: Int, id: Long) = selected(position)
    override fun onNothingSelected(parent: android.widget.AdapterView<*>?) = Unit
}

private class GateSpinnerAdapter(
    private val context: Context,
    gates: List<MainActivity.Gate>,
) : BaseAdapter() {
    private data class Row(val campus: String? = null, val gate: MainActivity.Gate? = null)

    private val rows = buildList {
        gates.groupBy { it.campus }.forEach { (campus, campusGates) ->
            add(Row(campus = campus))
            campusGates.forEach { add(Row(gate = it)) }
        }
    }

    private fun dp(value: Int) = (value * context.resources.displayMetrics.density).toInt()
    private fun background(color: Int, radius: Int = 0) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }

    override fun getCount() = rows.size
    override fun getItem(position: Int) = rows.getOrNull(position)?.gate
    override fun getItemId(position: Int) = rows.getOrNull(position)?.gate?.id?.toLong() ?: -position.toLong()
    override fun isEnabled(position: Int) = rows.getOrNull(position)?.gate != null

    fun gateAt(position: Int) = rows.getOrNull(position)?.gate

    fun positionOfGate(gateId: Int): Int = rows.indexOfFirst { it.gate?.id == gateId }
        .takeIf { it >= 0 }
        ?: rows.indexOfFirst { it.gate != null }.coerceAtLeast(0)

    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
        val gate = gateAt(position) ?: rows.firstNotNullOfOrNull { it.gate }
        return LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), 0, dp(12), 0)
            background = background(Color.rgb(10, 70, 52), 10)
            addView(ImageView(context).apply {
                setImageResource(R.drawable.ic_location_on)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                contentDescription = null
            }, LinearLayout.LayoutParams(dp(30), dp(24)).apply { marginEnd = dp(8) })
            addView(TextView(context).apply {
                text = gate?.location ?: "Select a gate"
                textSize = 14f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER_VERTICAL
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            addView(ImageView(context).apply {
                setImageResource(R.drawable.ic_expand_more)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                contentDescription = null
            }, LinearLayout.LayoutParams(dp(24), dp(24)))
        }
    }

    override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup?): View {
        val row = rows[position]
        return TextView(context).apply {
            text = row.campus ?: row.gate?.name.orEmpty()
            textSize = if (row.campus != null) 14f else 15f
            typeface = if (row.campus != null) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            setTextColor(if (row.campus != null) Color.rgb(6, 58, 43) else Color.rgb(24, 49, 40))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(if (row.campus != null) 12 else 30), dp(10), dp(12), dp(10))
            background = background(if (row.campus != null) Color.rgb(232, 244, 237) else Color.WHITE)
            minHeight = dp(if (row.campus != null) 42 else 46)
        }
    }
}
