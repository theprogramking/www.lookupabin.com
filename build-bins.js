const fs = require('fs')
const path = require('path')

const INPUT = 'data/bins.csv'
const OUTPUT_DIR = './public'

// Adjust to match your CSV columns
const FIELDS = ['bin', 'brand', 'type', 'country']
const SEP = ','

function main() {
  const csv = fs.readFileSync(INPUT, 'utf-8')

  // Split + clean
  let lines = csv.split('\n').map(l => l.trim()).filter(Boolean)

  // Sort by BIN (IMPORTANT for binary search)
  lines.sort((a, b) => {
    const aBin = parseInt(a.split(SEP)[0], 10)
    const bBin = parseInt(b.split(SEP)[0], 10)
    return aBin - bBin
  })

  const count = lines.length

  const bins = new Uint32Array(count)
  const offsets = new Uint32Array(count + 1)

  let dataParts = []
  let currentOffset = 0

  for (let i = 0; i < count; i++) {
    const line = lines[i]
    const parts = line.split(SEP)

    const bin = parseInt(parts[0], 10)

    if (isNaN(bin)) {
      throw new Error(`Invalid BIN at line ${i}: ${line}`)
    }

    bins[i] = bin
    offsets[i] = currentOffset

    const row = line + '\n'
    const bytes = Buffer.from(row, 'utf-8')

    dataParts.push(bytes)
    currentOffset += bytes.length
  }

  offsets[count] = currentOffset

  const dataBuffer = Buffer.concat(dataParts)

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR)
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'bins.bin'), Buffer.from(bins.buffer))
  fs.writeFileSync(path.join(OUTPUT_DIR, 'offsets.bin'), Buffer.from(offsets.buffer))
  fs.writeFileSync(path.join(OUTPUT_DIR, 'data.bin'), dataBuffer)

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'meta.json'),
    JSON.stringify({
      count,
      fields: FIELDS,
      fieldSep: SEP
    }, null, 2)
  )

  console.log(`✅ Done! Processed ${count} rows`)
}

main()