// LOAD INDEX AND PERFORM BINARY SEARCH

interface Meta {
  count: number;
  fields: string[];
  fieldSep: string;
}

interface LookupResult {
  found: boolean;
  bin?: number;
  fields?: Record<string, string>;
  rawRow?: string;
}

let bins: Uint32Array | null = null;
let offsets: Uint32Array | null = null;
let data: Uint8Array | null = null;
let meta: Meta | null = null;
let decoder: TextDecoder | null = null;

// CACHE
const cache = new Map<number, LookupResult>();
const CACHE_MAX = 200;
const cacheSet = (bin: number, result: LookupResult) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(bin, result);
};

async function loadIndex() {
  try {
    const [metaRes, binsRes, offsetsRes, dataRes] = await Promise.all([
      fetch("/meta.json"),
      fetch("/bins.bin"),
      fetch("/offsets.bin"),
      fetch("/data.bin"),
    ]);

    meta = (await metaRes.json()) as Meta;
    const [binsBuf, offsetsBuf, dataBuf] = await Promise.all([
      binsRes.arrayBuffer(),
      offsetsRes.arrayBuffer(),
      dataRes.arrayBuffer(),
    ]);

    bins = new Uint32Array(binsBuf);
    offsets = new Uint32Array(offsetsBuf);
    data = new Uint8Array(dataBuf);
    decoder = new TextDecoder("utf-8");

    self.postMessage({ type: "ready", count: meta.count });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
}

function binarySearch(binVal: number): number {
  if (!bins) return -1;
  let lo = 0;
  let hi = bins.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = bins[mid];
    if (v === binVal) return mid;
    if (v < binVal) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function lookup(binStr: string): LookupResult {
  if (!bins || !offsets || !data || !meta || !decoder) {
    return { found: false };
  }
  // NORMALIZE: FIRST 6 DIGITS
  const digits = binStr.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 6) return { found: false };

  const binVal = parseInt(digits, 10);

  // Cache hit
  const cached = cache.get(binVal);
  if (cached) return cached;

  const idx = binarySearch(binVal);
  if (idx === -1) {
    const result: LookupResult = { found: false };
    cacheSet(binVal, result);
    return result;
  }

  const start = offsets[idx];
  const end = offsets[idx + 1];
  const rawRow = decoder.decode(data.subarray(start, end));
  const parts = rawRow.split(meta.fieldSep);
  const fields: Record<string, string> = {};
  meta.fields.forEach((f, i) => {
    fields[f] = parts[i] ?? "";
  });

  const result: LookupResult = { found: true, bin: binVal, fields, rawRow };
  cacheSet(binVal, result);
  return result;
}

self.addEventListener("message", (e) => {
  const { type, bin, id } = e.data as {
    type: string;
    bin?: string;
    id?: number;
  };
  if (type === "init") {
    loadIndex();
  } else if (type === "lookup" && bin !== undefined) {
    const result = lookup(bin);
    self.postMessage({ type: "result", id, result });
  }
});
