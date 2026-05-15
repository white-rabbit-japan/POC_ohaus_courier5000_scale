#!/usr/bin/env python3
"""Read weight from an OHAUS Courier 5000 scale over USB serial.

The Courier 5000 enumerates as a USB CDC serial device. Default link settings
are 9600 8N1. The scale speaks OHAUS standard print protocol (not MT-SICS):
sending ``P\\r\\n`` (or ``IP\\r\\n``) prompts a single weight reading like
``"       0.32    kg     \\r\\n\\r\\n"``.

Usage:
    weigh.py                 # one reading from auto-detected port
    weigh.py --stream        # poll continuously
    weigh.py --port /dev/cu.usbmodemXXXX
"""

import argparse
import glob
import re
import sys
import time

import serial

DEFAULT_BAUD = 9600
PRINT_CMD = b"P\r\n"
READING_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*([a-zA-Z/]+)")


def find_port() -> str:
    candidates = sorted(glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/cu.usbserial*"))
    if not candidates:
        raise SystemExit("No USB serial device found. Plug in the scale or pass --port.")
    return candidates[0]


def read_weight(ser: serial.Serial) -> tuple[float, str, str]:
    ser.reset_input_buffer()
    ser.write(PRINT_CMD)
    ser.flush()
    # Read until we get a non-empty line or time out.
    deadline = time.time() + 2.0
    raw = b""
    while time.time() < deadline:
        chunk = ser.read(64)
        if chunk:
            raw += chunk
            if b"\r\n" in raw and raw.strip():
                break
    text = raw.decode(errors="replace").strip()
    if not text:
        raise RuntimeError("No response from scale (timeout).")
    if text.startswith("ES"):
        raise RuntimeError(f"Scale returned error: {text!r}")
    match = READING_RE.search(text)
    if not match:
        raise RuntimeError(f"Could not parse reading: {text!r}")
    value = float(match.group(1))
    unit = match.group(2)
    return value, unit, text


def main() -> int:
    parser = argparse.ArgumentParser(description="Read OHAUS Courier 5000 over USB.")
    parser.add_argument("--port", help="Serial device path (auto-detected if omitted).")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    parser.add_argument("--stream", action="store_true", help="Poll continuously.")
    parser.add_argument("--interval", type=float, default=0.5, help="Seconds between reads in --stream mode.")
    parser.add_argument("--raw", action="store_true", help="Print raw scale response.")
    args = parser.parse_args()

    port = args.port or find_port()
    with serial.Serial(port, baudrate=args.baud, bytesize=8, parity="N", stopbits=1, timeout=1) as ser:
        try:
            while True:
                value, unit, raw = read_weight(ser)
                if args.raw:
                    print(raw)
                else:
                    print(f"{value:.2f} {unit}")
                if not args.stream:
                    return 0
                time.sleep(args.interval)
        except KeyboardInterrupt:
            return 0
        except RuntimeError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(main())
