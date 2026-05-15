// OHAUS Courier 5000 — Web Serial POC.
// The scale enumerates as USB CDC-ACM. WebUSB cannot claim CDC interfaces
// (Chromium's protected-class blocklist), so we use the Web Serial API.
const PRINT_CMD = new TextEncoder().encode("P\r\n");
const READING_RE = /(-?\d+(?:\.\d+)?)\s*([a-zA-Z/]+)/;
const SERIAL_OPTIONS = {
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    flowControl: "none",
};
function $(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`missing element #${id}`);
    return el;
}
const els = {
    connect: $("connect"),
    disconnect: $("disconnect"),
    read: $("read"),
    stream: $("stream"),
    interval: $("interval"),
    status: $("status"),
    value: $("value"),
    unit: $("unit"),
    log: $("log"),
};
let port = null;
let reader = null;
let writer = null;
let streamTimer = null;
function log(line) {
    els.log.textContent += line + "\n";
    els.log.scrollTop = els.log.scrollHeight;
}
function setStatus(msg, isError = false) {
    els.status.textContent = msg;
    els.status.classList.toggle("err", isError);
}
function setConnected(connected) {
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
        if (!port.writable || !port.readable)
            throw new Error("Port opened without streams");
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
        setConnected(true);
        setStatus("Connected. Click Read once or enable Stream.");
        log("[open] 9600 8N1");
    }
    catch (err) {
        setStatus("Connect failed: " + err.message, true);
    }
});
els.disconnect.addEventListener("click", async () => {
    els.stream.checked = false;
    stopStreaming();
    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
            reader = null;
        }
        if (writer) {
            await writer.close();
            writer = null;
        }
        if (port) {
            await port.close();
            port = null;
        }
    }
    catch (err) {
        log("[disconnect] " + err.message);
    }
    setConnected(false);
    setStatus("Disconnected.");
    log("[close]");
});
els.read.addEventListener("click", () => { void readOnce(); });
els.stream.addEventListener("change", () => {
    if (els.stream.checked)
        startStreaming();
    else
        stopStreaming();
});
function startStreaming() {
    const ms = Math.max(100, Number(els.interval.value) || 500);
    stopStreaming();
    const tick = async () => {
        await readOnce();
        if (els.stream.checked)
            streamTimer = window.setTimeout(tick, ms);
    };
    void tick();
}
function stopStreaming() {
    if (streamTimer !== null)
        window.clearTimeout(streamTimer);
    streamTimer = null;
}
async function readOnce() {
    if (!port || !writer || !reader)
        return;
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
            els.value.textContent = parseFloat(m[1]).toFixed(2);
            els.unit.textContent = m[2];
            setStatus("Live.");
        }
        else {
            setStatus("Could not parse: " + line, true);
        }
    }
    catch (err) {
        setStatus("Read failed: " + err.message, true);
        stopStreaming();
    }
}
async function readLine(timeoutMs) {
    if (!reader)
        return null;
    const decoder = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const result = await Promise.race([
            reader.read(),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), remaining)),
        ]);
        if ("timeout" in result)
            break;
        if (result.done)
            break;
        buf += decoder.decode(result.value, { stream: true });
        const idx = buf.indexOf("\r\n");
        if (idx >= 0) {
            const line = buf.slice(0, idx).trim();
            if (line)
                return line;
            buf = buf.slice(idx + 2);
        }
    }
    return buf.trim() || null;
}
export {};
