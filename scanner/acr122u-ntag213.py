#!/usr/bin/env python3
"""TapTrack ACR122U helper for assumed blank NTAG213-compatible cards."""

import argparse
import json
import re
import sys

try:
    from smartcard.System import readers
except ImportError:
    sys.stderr.write("pyscard is required. Install python3-pyscard.\n")
    raise SystemExit(2)

USER_START_PAGE = 4
USER_PAGE_COUNT = 4
USER_BYTES = USER_PAGE_COUNT * 4
MIFARE_CLASSIC_BLOCK = 4
MIFARE_DEFAULT_KEY = [0xFF] * 6
IDENTIFIER = re.compile(r"^(?:\d{7,8}|\d{12}|P\d{7,8})$")


def fail(message, code=1):
    sys.stderr.write(f"{message}\n")
    raise SystemExit(code)


def transmit(connection, command, label):
    data, sw1, sw2 = connection.transmit(command)
    if (sw1, sw2) != (0x90, 0x00):
        fail(f"{label} failed (status {sw1:02X}{sw2:02X}).")
    return bytes(data)


def try_transmit(connection, command):
    data, sw1, sw2 = connection.transmit(command)
    return bytes(data) if (sw1, sw2) == (0x90, 0x00) else None


def read_bytes(connection, page=USER_START_PAGE, length=USER_BYTES):
    return transmit(connection, [0xFF, 0xB0, 0x00, page, length], "Card read")


def is_type2_card(connection):
    capability = try_transmit(connection, [0xFF, 0xB0, 0x00, 0x03, 0x04])
    return bool(
        capability
        and len(capability) == 4
        and capability[0] == 0xE1
        and capability[2] >= 0x12
    )


def read_mifare_classic(connection):
    if try_transmit(connection, [0xFF, 0x82, 0x00, 0x00, 0x06, *MIFARE_DEFAULT_KEY]) is None:
        fail("Could not load the default MIFARE Classic key.")
    authenticate = [
        0xFF, 0x86, 0x00, 0x00, 0x05,
        0x01, 0x00, MIFARE_CLASSIC_BLOCK, 0x60, 0x00,
    ]
    if try_transmit(connection, authenticate) is None:
        authenticate[-2] = 0x61
        if try_transmit(connection, authenticate) is None:
            fail("This MIFARE card is protected or was not prepared for TapTrack.")
    raw = try_transmit(
        connection,
        [0xFF, 0xB0, 0x00, MIFARE_CLASSIC_BLOCK, USER_BYTES],
    )
    if raw is None:
        fail("Could not read TapTrack data from MIFARE Classic block 4.")
    return raw


def display_value(raw):
    value = raw.split(b"\x00", 1)[0].rstrip(b"\xFF")
    if not value:
        return ""
    try:
        text = value.decode("ascii")
    except UnicodeDecodeError:
        return f"Non-text data ({value.hex().upper()})"
    return (
        text
        if all(character.isprintable() for character in text)
        else f"Non-text data ({value.hex().upper()})"
    )


def connect(reader_hint):
    available = list(readers())
    matches = [
        reader
        for reader in available
        if not reader_hint or reader_hint.lower() in str(reader).lower()
    ]
    if not matches:
        names = ", ".join(map(str, available)) or "none"
        fail(f"ACR122U reader not found. Available PC/SC readers: {names}")
    connection = matches[0].createConnection()
    try:
        connection.connect()
    except Exception as error:
        fail(f"Place one card on the ACR122U reader ({error}).")
    return connection


def main():
    parser = argparse.ArgumentParser()
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--read", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--reader", default="ACR122U")
    args = parser.parse_args()

    connection = connect(args.reader)
    type2 = is_type2_card(connection)
    previous = display_value(
        read_bytes(connection) if type2 else read_mifare_classic(connection)
    )

    if args.read:
        if previous and not IDENTIFIER.fullmatch(previous):
            fail("This card does not contain a valid TapTrack ID.")
        print(json.dumps({"read": True, "value": previous}))
        return

    if not type2:
        fail("Card enrollment supports NTAG213-compatible Type 2 cards only.")

    value = sys.stdin.readline().strip()
    if not IDENTIFIER.fullmatch(value):
        fail("TapTrack supplied an invalid card identifier.")
    payload = value.encode("ascii").ljust(USER_BYTES, b"\x00")

    for offset in range(USER_PAGE_COUNT):
        page = USER_START_PAGE + offset
        block = payload[offset * 4 : offset * 4 + 4]
        transmit(
            connection,
            [0xFF, 0xD6, 0x00, page, 0x04, *block],
            f"Page {page} write",
        )

    verified = display_value(read_bytes(connection))
    if verified != value:
        fail("Card verification did not match the requested identifier.")
    print(
        json.dumps(
            {
                "readBeforeWrite": True,
                "verified": True,
                "value": verified,
            }
        )
    )


if __name__ == "__main__":
    main()
