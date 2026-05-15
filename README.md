# POC: OHAUS Courier 5000 over USB

Minimal proof-of-concept for reading weight from an **OHAUS Courier 5000** scale
over its USB-serial interface on macOS / Linux.

![Pikachu on the Courier 5000 — 6.00 kg](pikachu-6kg.jpeg)

## Hardware

- OHAUS Courier 5000
- USB type-B cable to host

On macOS the scale enumerates as `/dev/cu.usbmodem*` (USB CDC).

## Serial settings

| Setting   | Value  |
|-----------|--------|
| Baud      | 9600   |
| Data bits | 8      |
| Parity    | None   |
| Stop bits | 1      |

## Protocol

The Courier 5000 speaks the OHAUS *standard print* protocol (it does **not**
respond to MT-SICS commands like `SI` / `S` — those return `ES`).

Send a print request:

```
P\r\n      (or  IP\r\n )
```

The scale replies with a single line such as:

```
       0.32    kg
```

## Usage

```bash
pip install pyserial
python3 weigh.py                # single reading
python3 weigh.py --stream       # continuous polling
python3 weigh.py --raw          # show raw scale response
python3 weigh.py --port /dev/cu.usbmodemXXXX
```

Example:

```
$ python3 weigh.py
6.00 kg
```
