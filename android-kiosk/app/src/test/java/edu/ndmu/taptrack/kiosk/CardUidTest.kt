package edu.ndmu.taptrack.kiosk

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class CardUidTest {
    @Test fun rawUidKeepsHighBytesAndLeadingZeroes() {
        assertEquals("0080FF01", CardUid.hex(byteArrayOf(0, 0x80.toByte(), 0xff.toByte(), 1)))
    }

    @Test fun rawUidKeepsEveryByteForDatabaseLookup() {
        val uid = byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 0xff.toByte())
        val original = uid.copyOf()
        assertEquals("000102030405060708FF", CardUid.hex(uid))
        assertArrayEquals(original, uid)
    }

    @Test(expected = IllegalArgumentException::class)
    fun emptyUidIsRejected() {
        CardUid.hex(byteArrayOf())
    }
}
