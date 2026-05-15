// OHAUS Courier 5000 — Web Serial POC.
// The scale enumerates as USB CDC-ACM. WebUSB cannot claim CDC interfaces
// (Chromium's protected-class blocklist), so we use the Web Serial API.

const PRINT_CMD: Uint8Array = new TextEncoder().encode("P\r\n");
const READING_RE = /(-?\d+(?:\.\d+)?)\s*([a-zA-Z/]+)/;
const SERIAL_OPTIONS: SerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  parity: "none",
  stopBits: 1,
  flowControl: "none",
};

interface Elements {
  connect: HTMLButtonElement;
  disconnect: HTMLButtonElement;
  read: HTMLButtonElement;
  stream: HTMLInputElement;
  interval: HTMLInputElement;
  status: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  log: HTMLElement;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const els: Elements = {
  connect: $<HTMLButtonElement>("connect"),
  disconnect: $<HTMLButtonElement>("disconnect"),
  read: $<HTMLButtonElement>("read"),
  stream: $<HTMLInputElement>("stream"),
  interval: $<HTMLInputElement>("interval"),
  status: $("status"),
  value: $("value"),
  unit: $("unit"),
  log: $("log"),
};

let port: SerialPort | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let streamTimer: number | null = null;

function log(line: string): void {
  els.log.textContent += line + "\n";
  els.log.scrollTop = els.log.scrollHeight;
}

function setStatus(msg: string, isError = false): void {
  els.status.textContent = msg;
  els.status.classList.toggle("err", isError);
}

function setConnected(connected: boolean): void {
  els.connect.disabled = connected;
  els.disconnect.disabled = !connected;
  els.read.disabled = !connected;
  els.stream.disabled = !connected;
}

if (!("serial" in navigator)) {
  setStatus("Web Serial not supported in this browser. Use Chrome, Edge, or Opera.", true);
  els.connect.disabled = true;
}

els.connect.addEventListener("click", async () => {
  try {
    port = await navigator.serial.requestPort();
    await port.open(SERIAL_OPTIONS);
    if (!port.writable || !port.readable) throw new Error("Port opened without streams");
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    setConnected(true);
    setStatus("Connected. Click Read once or enable Stream.");
    log("[open] 9600 8N1");
  } catch (err) {
    setStatus("Connect failed: " + (err as Error).message, true);
  }
});

async function releasePort(): Promise<void> {
  els.stream.checked = false;
  stopStreaming();
  try {
    if (reader) { await reader.cancel(); reader.releaseLock(); reader = null; }
    if (writer) { await writer.close(); writer = null; }
    if (port) { await port.close(); port = null; }
  } catch (err) {
    log("[release] " + (err as Error).message);
  }
}

els.disconnect.addEventListener("click", async () => {
  await releasePort();
  setConnected(false);
  setStatus("Disconnected.");
  log("[close]");
});

// Release the OS-level serial lock when the page goes away (tab close,
// reload, navigation). Without this, the port stays exclusively held
// until the entire browser process exits, blocking other tabs/apps.
window.addEventListener("pagehide", () => { void releasePort(); });

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", (event: Event) => {
    if (port && event.target === port) {
      void releasePort();
      setConnected(false);
      setStatus("Scale was unplugged.", true);
      log("[disconnect] device removed");
    }
  });
}

els.read.addEventListener("click", () => { void readOnce(); });

els.stream.addEventListener("change", () => {
  if (els.stream.checked) startStreaming();
  else stopStreaming();
});

function startStreaming(): void {
  const ms = Math.max(100, Number(els.interval.value) || 500);
  stopStreaming();
  const tick = async (): Promise<void> => {
    await readOnce();
    if (els.stream.checked) streamTimer = window.setTimeout(tick, ms);
  };
  void tick();
}

function stopStreaming(): void {
  if (streamTimer !== null) window.clearTimeout(streamTimer);
  streamTimer = null;
}

async function readOnce(): Promise<void> {
  if (!port || !writer || !reader) return;
  try {
    await writer.write(PRINT_CMD);
    const line = await readLine(2000);
    log("<< " + JSON.stringify(line));
    if (!line) {
      setStatus("Timed out waiting for reading.", true);
      return;
    }
    if (line.startsWith("ES")) {
      setStatus("Scale error: " + line, true);
      return;
    }
    const m = line.match(READING_RE);
    if (m) {
      els.value.textContent = parseFloat(m[1]!).toFixed(2);
      els.unit.textContent = m[2]!;
      setStatus("Live.");
    } else {
      setStatus("Could not parse: " + line, true);
    }
  } catch (err) {
    setStatus("Read failed: " + (err as Error).message, true);
    stopStreaming();
  }
}

async function readLine(timeoutMs: number): Promise<string | null> {
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race<
      ReadableStreamReadResult<Uint8Array> | { timeout: true }
    >([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), remaining)),
    ]);
    if ("timeout" in result) break;
    if (result.done) break;
    buf += decoder.decode(result.value, { stream: true });
    const idx = buf.indexOf("\r\n");
    if (idx >= 0) {
      const line = buf.slice(0, idx).trim();
      if (line) return line;
      buf = buf.slice(idx + 2);
    }
  }
  return buf.trim() || null;
}

export {};
