package edu.ndmu.taptrack.kiosk

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView

class SplashActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val openKiosk = Runnable {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            setPadding(dp(8), dp(24), dp(8), dp(24))
            addView(ImageView(this@SplashActivity).apply {
                setImageResource(R.drawable.taptrack_branding_splash)
                scaleType = ImageView.ScaleType.FIT_CENTER
                adjustViewBounds = true
                contentDescription = "TapTrack and Notre Dame of Marbel University branding"
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))
        })
        handler.postDelayed(openKiosk, 1_250L)
    }

    override fun onDestroy() {
        handler.removeCallbacks(openKiosk)
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
