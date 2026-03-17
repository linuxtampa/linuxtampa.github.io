---
layout: base.njk
title: "LinuxTampa 1.0 — Independent Consulting (2000–2001)"
description: The original LinuxTampa — self-employed at the height of the dot-com era, building Linux-based systems including the world's first Linux-based ATM.
---

# LinuxTampa 1.0 — Independent Consulting (2000–2001)
These are projects I undertook during my first run as an independent Linux consultant.

## MoneyTree ATM — The World's First Linux-Based ATM (2000)

The flagship project of this era was **MoneyTree ATM** in Destin, FL. The hardware team handled the enclosure — a hardened, robbery-resistant cabinet with a retractable keyboard controlled via RS-232C serial port. My job was everything else.

### Hardware Integration

The machine had **six serial devices**, each requiring a custom driver:

| Device | Purpose |
|--------|---------|
| Retractable keyboard | Motor control via RS-232C |
| 8 side buttons (4×2) | POS-style selection buttons |
| 19.2k bps modem | Visa merchant authorization |
| De La Rue cash dispenser | Currency dispensing |
| 3" thermal printer | Receipt printing with auto-cut |
| Magnetic stripe card reader | Payment card swipe (EMV was years away) |

The stock Linux kernel supported four serial ports. Six were required. The fix was straightforward but required going into the kernel: I found the C array of structs declaring IRQ/DMA settings for COM1–COM4, doubled it to eight entries, and recompiled. This is possibly the smallest and easiest kernel modification that ever added a genuinely essential capability.

The De La Rue cash dispenser had no SDK, but its serial protocol was well-documented. I wrote directly to the serial port according to the protocol spec.

Because there was no continuously-available IP connectivity in 2000, remote management wasn't feasible — machines required in-person visits for maintenance.

### If we were to do it all over again

A newer ATM platform would not have required six serial ports:
  * the 8 side buttons, the cash dispenser and thermal printer would be USB driven, would not have required hardcoding IRQ/DMA channels, and would auto-configure themselves.
  * Similarly, the card reader would also be USB-based, but also would feature smart-chip & contactless/RFID functionality as well.
  * Communication for such a system today would have been ethernet or Wifi-based, with a VPN tunnel, and 24x7 real-time monitoring.  The availability of higher bandwidth today would make advertising a key revenue source in addition to per-transaction convenience fees.

### Software

- **Device drivers** for all six serial devices
- **End-user GUI** and **manager/maintenance GUI** built with Qt 2.0 (from Trolltech, Norway) and the KDE/SDL libraries
- **Visa merchant authorization** — dial-up via the modem, request/response sequence to authorize the cardholder's account for the dispensed amount
- **Media playback on successful dispense** — the machine played a full-screen video after dispensing cash. At the banking convention, it was a dancing baby with *"We're in the Money"* playing in the background. Deployed systems could be configured with any AVI/MOV file the owner wanted.

## Other Engagements

- **byteaudio.com** — consulting for an independent digital music label
- **cookiecryption.com** — security consulting, and implementation for language-specific SDKs.
- **LinuxSC.com** — custom multicast router implementation in Linux, used for mobile wired Ethernet on planes.
- Various other companies from the dot-com era, most of which are now long-forgotten.

[&larr; Back to Work](/work/)
