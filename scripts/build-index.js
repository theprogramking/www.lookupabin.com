#!/usr/bin/env node
/**
 * Build script: CSV → compact binary index
 *
 * Input:  data/bins.csv  (BIN,Brand,Type,Category,Issuer,IssuerPhone,IssuerUrl,isoCode2,isoCode3,CountryName)
 * Output: public/
 *   bins.bin      — sorted Uint32Array of BIN values
 *   offsets.bin   — Uint32Array of byte offsets into data.bin (length = records + 1)
 *   data.bin      — concatenated UTF-8 records, each field separated by \x1F (unit separator)
 *   meta.json     — { count, fields, fieldSep, buildId }
 *
 * Fixes included:
 *  - Robust CSV splitting (handles quoted fields with embedded newlines)
 *  - BOM removal
 *  - Logs CSV preview to confirm script reads the expected CSV (helps identify sample-vs-real)
 *  - Removes previous .bin / meta.json files before writing
 *  - Atomic writes (write temp -> rename)
 *  - Validation of offsets / final offset vs data length / monotonic offsets / sorted bins
 *  - Adds buildId timestamp to meta.json (useful for cache-busting in frontend)
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  renameSync,
} from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const PUBLIC_DIR = resolve(ROOT, "public");

// CSV PARSING HELPERS

/**
 * parseCSVLine(line)
 * - parse a single CSV record line into fields
 * - supports standard CSV quoting: "" -> " and commas inside quotes
 */
function parseCSVLine(line) {
  const fields = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * splitCSVRecords(text)
 * - Splits raw CSV text into records robustly.
 * - Treats CR and LF (CRLF) as line breaks only when not inside a quoted field.
 * - Preserves embedded newlines inside quoted fields.
 */
function splitCSVRecords(text) {
  const records = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      // handle doubled quotes inside a quoted field
      if (inQuote && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
        cur += '"'; // keep quotes so parseCSVLine can consume them correctly
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      // consume CRLF as a single break if applicable
      if (ch === "\r" && next === "\n") i++;
      // push non-empty records (trim to avoid pushing whitespace-only)
      if (cur.length > 0) records.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) records.push(cur);
  return records;
}

// ATOMIC WRITE

function atomicWrite(filePath, buffer) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, buffer);
  renameSync(tmp, filePath);
}

// MAIN

function main() {
  const csvPath = resolve(DATA_DIR, "bins.csv");

  // Create sample CSV if missing (keeps behavior from your original script)
  if (!existsSync(csvPath)) {
    console.warn(`⚠  No CSV found at ${csvPath}. Creating sample data...`);
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      csvPath,
      [
        "BIN,Brand,Type,Category,Issuer,IssuerPhone,IssuerUrl,isoCode2,isoCode3,CountryName",
        '002102,"PRIVATE LABEL",CREDIT,STANDARD,"CHINA MERCHANTS BANK",95555,https://english.cmbchina.com,CN,CHN,CHINA',
        '004078,"PRIVATE LABEL",DEBIT,GIFT,"SHIFT4 PAYMENTS",,,US,USA,"UNITED STATES"',
        '007343,"PRIVATE LABEL",DEBIT,,"BANCO PAN",+551732119961,,BR,BRA,BRAZIL',
        '411111,VISA,CREDIT,CLASSIC,"JPMORGAN CHASE BANK N.A.",18005321522,https://www.chase.com,US,USA,"UNITED STATES"',
        '510510,MASTERCARD,CREDIT,STANDARD,"CITIBANK",18002850653,https://www.citibank.com,US,USA,"UNITED STATES"',
        '371449,AMEX,CREDIT,GOLD,"AMERICAN EXPRESS",18002975566,https://www.americanexpress.com,US,USA,"UNITED STATES"',
        '601100,DISCOVER,CREDIT,STANDARD,"DISCOVER BANK",18005473029,https://www.discover.com,US,USA,"UNITED STATES"',
        '4000002500003155,VISA,DEBIT,CLASSIC,"BANK OF AMERICA",18888274747,https://www.bankofamerica.com,US,USA,"UNITED STATES"',
      ].join("\n"),
    );
    console.log("  Created sample data/bins.csv");
  }

  console.log("📂 Reading CSV...");
  let raw = readFileSync(csvPath, "utf8");

  // Show a preview so you can verify the script read the real CSV (important to catch sample-vs-real)
  console.log("--- CSV PREVIEW (first 300 chars) ---");
  console.log(raw.slice(0, 300).replace(/\r/g, "\\r").replace(/\n/g, "\\n"));
  console.log("--- end preview ---");

  // strip BOM if present
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  // robustly split CSV into records (handles quoted newlines)
  const lines = splitCSVRecords(raw).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.error("CSV appears empty after parsing.");
    process.exit(1);
  }

  // parse header
  const header = parseCSVLine(lines[0]);
  const FIELDS = [
    "Brand",
    "Type",
    "Category",
    "Issuer",
    "IssuerPhone",
    "IssuerUrl",
    "isoCode2",
    "isoCode3",
    "CountryName",
  ];
  const fieldIdx = FIELDS.map((f) => header.indexOf(f));
  const binIdx = header.indexOf("BIN");

  if (binIdx === -1) {
    console.error("CSV must have a BIN column");
    process.exit(1);
  }

  console.log(`  Header columns: ${header.join(", ")}`);
  console.log(`  Total records (including header): ${lines.length}`);

  // parse records
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    const binStr = (parts[binIdx] || "").trim();
    if (!binStr) continue;
    // Take first 6 digits (normalize)
    const digits = binStr.replace(/\D/g, "").slice(0, 6);
    if (digits.length < 1) continue;
    const binNum = parseInt(digits, 10);
    if (isNaN(binNum) || binNum <= 0) continue;
    const values = fieldIdx.map((fi) =>
      fi >= 0 ? (parts[fi] || "").trim() : "",
    );
    records.push({ bin: binNum, values });
  }

  if (records.length === 0) {
    console.error("No valid records parsed from CSV.");
    process.exit(1);
  }

  // sort by bin (numeric)
  records.sort((a, b) => a.bin - b.bin);

  console.log(`  Valid records parsed: ${records.length}`);

  // prepare output buffers
  const FIELD_SEP = "\x1F";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  const binsBuf = new Uint32Array(records.length);
  const offsetsArr = new Uint32Array(records.length + 1);
  const dataChunks = [];
  let offset = 0;

  for (let i = 0; i < records.length; i++) {
    binsBuf[i] = records[i].bin;
    offsetsArr[i] = offset;
    const rowStr = records[i].values.join(FIELD_SEP);
    const encoded = encoder.encode(rowStr);
    dataChunks.push(encoded);
    offset += encoded.byteLength;
  }
  offsetsArr[records.length] = offset;

  // merge data buffer
  const dataBuf = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of dataChunks) {
    dataBuf.set(chunk, pos);
    pos += chunk.byteLength;
  }

  // ensure output directory
  mkdirSync(PUBLIC_DIR, { recursive: true });

  // remove old generated files so dev server can't accidentally serve stale ones
  const oldFiles = readdirSync(PUBLIC_DIR).filter(
    (f) =>
      f === "bins.bin" ||
      f === "offsets.bin" ||
      f === "data.bin" ||
      f === "meta.json",
  );
  for (const f of oldFiles) {
    try {
      unlinkSync(resolve(PUBLIC_DIR, f));
      console.log(`Removed old file: ${f}`);
    } catch (err) {
      // ignore
    }
  }

  // write files atomically (write tmp then rename)
  const buildId = Date.now();
  atomicWrite(resolve(PUBLIC_DIR, "bins.bin"), Buffer.from(binsBuf.buffer));
  atomicWrite(
    resolve(PUBLIC_DIR, "offsets.bin"),
    Buffer.from(offsetsArr.buffer),
  );
  atomicWrite(resolve(PUBLIC_DIR, "data.bin"), Buffer.from(dataBuf.buffer));
  const meta = {
    count: records.length,
    fields: FIELDS,
    fieldSep: FIELD_SEP,
    buildId,
  };
  atomicWrite(
    resolve(PUBLIC_DIR, "meta.json"),
    Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
  );

  const totalKB = (
    (binsBuf.byteLength + offsetsArr.byteLength + dataBuf.byteLength) /
    1024
  ).toFixed(1);
  console.log(
    `✅ Index built: ${records.length} records, ~${totalKB} KB total`,
  );
  console.log(
    "   public/bins.bin, offsets.bin, data.bin, meta.json (buildId:",
    buildId,
    ")",
  );

  // --------------- Post-build validation ---------------
  console.log("🔎 Validating written files...");

  const binsFile = readFileSync(resolve(PUBLIC_DIR, "bins.bin"));
  const offsetsFile = readFileSync(resolve(PUBLIC_DIR, "offsets.bin"));
  const dataFile = readFileSync(resolve(PUBLIC_DIR, "data.bin"));
  const metaFile = JSON.parse(
    readFileSync(resolve(PUBLIC_DIR, "meta.json"), "utf8"),
  );

  const binsView = new Uint32Array(
    binsFile.buffer,
    binsFile.byteOffset,
    binsFile.byteLength / 4,
  );
  const offsetsView = new Uint32Array(
    offsetsFile.buffer,
    offsetsFile.byteOffset,
    offsetsFile.byteLength / 4,
  );
  const dataView = new Uint8Array(
    dataFile.buffer,
    dataFile.byteOffset,
    dataFile.byteLength,
  );

  let ok = true;
  if (binsView.length !== records.length) {
    console.error(
      `⛔ bins.bin length (${binsView.length}) != parsed records (${records.length})`,
    );
    ok = false;
  }
  if (offsetsView.length !== records.length + 1) {
    console.error(
      `⛔ offsets.bin length (${offsetsView.length}) != records+1 (${records.length + 1})`,
    );
    ok = false;
  }
  if (offsetsView[offsetsView.length - 1] !== dataView.length) {
    console.error(
      `⛔ final offset (${offsetsView[offsetsView.length - 1]}) != data.bin length (${dataView.length})`,
    );
    ok = false;
  }

  // check monotonic offsets and ranges
  for (let i = 0; i < offsetsView.length - 1; i++) {
    if (offsetsView[i] > offsetsView[i + 1]) {
      console.error(
        `⛔ offsets not monotonic at ${i}: ${offsetsView[i]} > ${offsetsView[i + 1]}`,
      );
      ok = false;
      break;
    }
    if (offsetsView[i] < 0 || offsetsView[i] > dataView.length) {
      console.error(`⛔ offset ${i} out of range: ${offsetsView[i]}`);
      ok = false;
      break;
    }
  }

  // show first 10 items for sanity
  const debugCount = Math.min(10, records.length);
  console.log("First few bins / decoded rows:");
  for (let i = 0; i < debugCount; i++) {
    const b = binsView[i];
    const s = offsetsView[i];
    const e = offsetsView[i + 1];
    const rawRow = decoder.decode(dataView.subarray(s, e));
    const parts = rawRow.split(FIELD_SEP);
    console.log(
      ` ${i}: BIN=${b} offset=${s}-${e} len=${e - s} => fields: [${parts.map((p) => p.slice(0, 40)).join(" | ")}]`,
    );
    const expectedJoined = records[i].values.join(FIELD_SEP);
    if (rawRow !== expectedJoined) {
      console.warn(
        `   ⚠ mismatch at index ${i}: decoded !== original parsed record`,
      );
      ok = false;
    }
  }

  // check bins sorted and warn on duplicates
  for (let i = 1; i < binsView.length; i++) {
    if (binsView[i - 1] > binsView[i]) {
      console.error(
        `⛔ bins not sorted at ${i - 1} (${binsView[i - 1]}) > ${i} (${binsView[i]})`,
      );
      ok = false;
      break;
    }
  }
  let dupCount = 0;
  for (let i = 1; i < binsView.length; i++) {
    if (binsView[i - 1] === binsView[i]) dupCount++;
  }
  if (dupCount > 0) {
    console.warn(
      ` ⚠ ${dupCount} duplicate BIN(s) found after normalizing to 6 digits. Binary search will find one of them (first match is not guaranteed). Consider deduplicating or aggregating.`,
    );
  }

  if (ok) {
    console.log("✅ Validation passed — files look consistent.");
  } else {
    console.error("❌ Validation failed — inspect the warnings/errors above.");
    process.exit(2);
  }

  // Helpful hint: to force browser to reload new files during dev, use ?buildId=${buildId} in worker fetches
  console.log(
    "TIP: In dev, if the browser caches /public assets, fetch them with a cache-busting query like /bins.bin?buildId=" +
      buildId,
  );
}

main();
