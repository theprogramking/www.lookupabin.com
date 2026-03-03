# lookupabin.com

The open-source codebase for www.lookupabin.com, a fast, offline BIN/IIN lookup tool built for developers, ISOs, and payment companies.

## Features

- ⚡ **Instant lookups** — O(log n) binary search on a typed binary index
- 🔒 **Fully offline** — data never leaves your device
- 🧵 **Non-blocking** — all CSV parsing & search runs in a Web Worker
- 📦 **Compact index** — binary files (not JSON) minimize payload
- 💅 **Neumorphism UI** — soft, embossed design language
- 📱 **Mobile-friendly** — responsive layout

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build & run

```bash
# Development (auto-builds index + hot reload)
npm run build:index
npm run dev

# Production build
npm run build
npm run preview
```

## How It Works (`scripts/build-index.js`)

The Node.js script parses `data/bins.csv` and produces three binary files in `public/`:

| File          | Contents                                                      |
| ------------- | ------------------------------------------------------------- |
| `bins.bin`    | Sorted `Uint32Array` of BIN values                            |
| `offsets.bin` | `Uint32Array` of byte offsets into `data.bin`                 |
| `data.bin`    | Concatenated UTF-8 record strings, fields separated by `\x1F` |
| `meta.json`   | Field names and record count                                  |

## Runtime

1. Page loads — fetches `meta.json` + all three `.bin` files in parallel
2. Web Worker receives the `ArrayBuffer`s, wraps them in typed arrays
3. On input, the Worker performs **binary search** on `bins` (Uint32Array) → O(log n)
4. Found index → slice `data.bin` using `offsets` → decode single record
5. 200-entry LRU cache for repeat lookups
6. Result posted back to main thread → React renders

## Performance Notes

- Binary search: O(log n) — ~17 comparisons for 100k records
- Gzip/Brotli compression applied automatically at build time
- Web Worker keeps UI thread free at all times
- 100ms debounce on input prevents excessive lookups while typing

## Data Source

BIN data is derived from the CSV datasets provided by [venelinkochev/bin-list-data](https://github.com/venelinkochev/bin-list-data). Huge thanks for maintaining this resource.

## License

This project is licensed under the MIT License — you are free to use, modify, and distribute this code for personal or commercial use.
