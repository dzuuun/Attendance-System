package edu.ndmu.taptrack.kiosk

object CardUid {
    fun hex(uid: ByteArray): String {
        require(uid.isNotEmpty()) { "This card does not provide a UID." }
        return uid.joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0').uppercase()
        }
    }
}
