#!/usr/bin/env python3
"""Reads keyboard-wedge scanners separately through Linux evdev devices."""
import glob
import json
import os
import selectors
import struct
import time

EVENT = struct.Struct("llHHI")
EV_KEY = 1
ENTER = 28
SHIFT_KEYS = {42, 54}
KEYS = {
    **{code: str(number) for code, number in zip(range(2, 11), range(1, 10))},
    11: "0", 12: "-", 13: "=", 57: " ",
    **{code: char for code, char in zip(range(16, 26), "qwertyuiop")},
    **{code: char for code, char in zip(range(30, 39), "asdfghjkl")},
    **{code: char for code, char in zip(range(44, 51), "zxcvbnm")},
    71: "7", 72: "8", 73: "9",
    75: "4", 76: "5", 77: "6",
    79: "1", 80: "2", 81: "3", 82: "0",
}

selector = selectors.DefaultSelector()
devices = {}

def device_name(event_path):
    try:
        with open(f"/sys/class/input/{os.path.basename(event_path)}/device/name", encoding="utf8") as handle:
            return handle.read().strip()
    except OSError:
        return "USB scanner"

def stable_id(event_path):
    base = os.path.basename(event_path)
    # Prefer the physical USB path so two identical readers without serial
    # numbers retain separate, predictable assignments.
    for link in glob.glob("/dev/input/by-path/*-event-kbd") + glob.glob("/dev/input/by-id/*-event-kbd"):
        if os.path.basename(os.path.realpath(link)) == base:
            return os.path.basename(link)
    return os.path.realpath(f"/sys/class/input/{base}/device")

def discover():
    known = {state["path"] for state in devices.values()}
    for path in glob.glob("/dev/input/event*"):
        if path in known:
            continue
        try:
            handle = open(path, "rb", buffering=0)
            key = stable_id(path)
            state = {"path": path, "handle": handle, "id": key, "name": device_name(path), "text": "", "shift": False}
            selector.register(handle, selectors.EVENT_READ, state)
            devices[handle.fileno()] = state
        except (OSError, PermissionError):
            pass

while True:
    discover()
    for selected, _mask in selector.select(timeout=1):
        state = selected.data
        try:
            packet = state["handle"].read(EVENT.size)
            if len(packet) != EVENT.size:
                continue
            _sec, _usec, kind, code, value = EVENT.unpack(packet)
            if kind != EV_KEY:
                continue
            if code in SHIFT_KEYS:
                state["shift"] = value != 0
            elif value == 1 and code == ENTER:
                if state["text"]:
                    print(json.dumps({"deviceId": state["id"], "name": state["name"], "value": state["text"]}), flush=True)
                state["text"] = ""
            elif value == 1 and code in KEYS:
                char = KEYS[code]
                state["text"] += char.upper() if state["shift"] else char
        except OSError:
            try:
                selector.unregister(state["handle"])
            except Exception:
                pass
            devices.pop(state["handle"].fileno(), None)
            state["handle"].close()
    time.sleep(0.01)
