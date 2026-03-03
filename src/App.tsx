import { useCallback, useEffect, useRef, useState } from "react";
import LookupWorker from "./worker/lookup.worker?worker";
import "./index.css";

// TYPES
type LookupResult = {
  found: boolean;
  bin?: number;
  fields?: Record<string, string>;
  rawRow?: string;
};
type WorkerStatus = "loading" | "ready" | "error";

// LABELS
const FIELD_LABELS: Record<string, string> = {
  Brand: "Brand",
  Type: "Type",
  Category: "Category",
  Issuer: "Issuer",
  IssuerPhone: "Phone",
  IssuerUrl: "Website",
  isoCode2: "ISO-2",
  isoCode3: "ISO-3",
  CountryName: "Country",
};

// ICONS
const FIELD_ICONS: Record<string, string> = {
  Brand: "💳",
  Type: "⚙️",
  Category: "📁",
  Issuer: "🏦",
  IssuerPhone: "📞",
  IssuerUrl: "🌐",
  isoCode2: "🏳️",
  isoCode3: "🗺️",
  CountryName: "🌍",
};

// SAMPLE BINS
const SAMPLE_BINS = [
  { brand: "VISA", bin: "492494" },
  { brand: "AMEX", bin: "344402" },
  { brand: "MASTERCARD", bin: "543421" },
  { brand: "DISCOVER", bin: "645844" },
];

// BRAND METADATA
const BRAND_META: Record<string, { gradient: string; label: string }> = {
  visa: { gradient: "linear-gradient(135deg,#2563eb,#1d4ed8)", label: "VISA" },
  mastercard: {
    gradient: "linear-gradient(135deg,#ff5f00,#eb001b)",
    label: "MC",
  },
  amex: { gradient: "linear-gradient(135deg,#b8860b,#ffd700)", label: "AMEX" },
  discover: {
    gradient: "linear-gradient(135deg,#ff6000,#ffcc00)",
    label: "DISC",
  },
};

// BIN CARD
const BinCard = ({
  brand,
  bin,
  onClick,
}: {
  brand: string;
  bin: string;
  onClick: (b: string) => void;
}) => {
  const meta = BRAND_META[brand.toLowerCase()] ?? {
    gradient: "linear-gradient(135deg,#eef2ff,#fff)",
    label: brand.slice(0, 3),
  };
  return (
    <button
      onClick={() => onClick(bin)}
      aria-label={`Try ${brand}`}
      className="flex-shrink-0 w-40 p-3 rounded-xl flex flex-col items-start gap-2 transition-transform duration-150 hover:scale-105"
      style={{ background: meta.gradient }}
    >
      <div className="w-full flex items-center justify-between">
        <div className="font-display font-bold text-sm">{brand}</div>
        <div className="text-xs font-mono opacity-90">{meta.label}</div>
      </div>
      <div className="mt-2 font-mono text-lg">{bin}</div>
    </button>
  );
};

// HORIZONTAL SCROLLER
const ScrollingBinRow = ({ onSelect }: { onSelect: (bin: string) => void }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let paused = false;
    const speed = 0.03;
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      if (!paused) {
        el.scrollLeft += dt * speed;
        if (el.scrollLeft >= el.scrollWidth / 2)
          el.scrollLeft -= el.scrollWidth / 2;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const onEnter = () => (paused = true);
    const onLeave = () => (paused = false);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const items = [...SAMPLE_BINS, ...SAMPLE_BINS];
  return (
    <div
      ref={ref}
      className="w-full flex gap-3 overflow-x-auto no-scrollbar py-2"
    >
      {items.map((s, i) => (
        <div key={`${s.bin}-${i}`} className="flex-shrink-0">
          <BinCard brand={s.brand} bin={s.bin} onClick={onSelect} />
        </div>
      ))}
    </div>
  );
};

let msgId = 0;

export default function App() {
  // STATE
  const [input, setInput] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [status, setStatus] = useState<WorkerStatus>("loading");
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searching, setSearching] = useState(false);

  // REFS
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (r: LookupResult) => void>());
  const debounceRef = useRef<number | null>(null);

  // WORKER INIT
  useEffect(() => {
    const w = new LookupWorker();
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const { type, id, result: res } = e.data as any;
      if (type === "ready") setStatus("ready");
      else if (type === "error") setStatus("error");
      else if (type === "result" && id != null) {
        const fn = pending.current.get(id);
        if (fn) {
          pending.current.delete(id);
          fn(res as LookupResult);
        }
      }
    };
    w.postMessage({ type: "init" });
    return () => w.terminate();
  }, []);

  // LOOKUP
  const doLookup = useCallback(
    (bin: string) => {
      if (!workerRef.current || status !== "ready") return;
      const digits = bin.replace(/\D/g, "").slice(0, 6);
      if (digits.length < 6) {
        setResult(null);
        setSearching(false);
        return;
      }
      const id = ++msgId;
      setSearching(true);
      new Promise<LookupResult>((res) => {
        pending.current.set(id, res);
        workerRef.current!.postMessage({ type: "lookup", bin: digits, id });
      }).then((r) => {
        setResult(r);
        setSearching(false);
      });
    },
    [status],
  );

  // INPUT HANDLER
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.replace(/(.{4})/g, "$1 ").trim();
    setInput(formatted);
    setShowRaw(false);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doLookup(raw), 100);
  };

  // COPY FIELDS
  const handleCopy = () => {
    if (!result?.fields) return;
    const text = Object.entries(result.fields)
      .filter(([, v]) => v)
      .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const digits = input.replace(/\D/g, "");
  const canLookup = digits.length >= 6;

  return (
    <div className="min-h-screen neu-bg flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 text-center">
        <div
          className="neu-card-flat inline-flex items-center gap-3 px-6 py-3 mb-4 rounded-2xl"
          style={{
            background: "white",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
          }}
        >
          <span className="text-2xl" style={{ paddingBottom: 5 }}>
            💳
          </span>
          <span className="font-display text-sm tracking-widest uppercase text-neu-muted">
            BIN Lookup
          </span>
        </div>

        {/*<p className="text-neu-muted font-body text-sm">
          {status === "loading" && "Loading index…"}
          {status === "ready" &&
            `${recordCount.toLocaleString()} BINs indexed · offline · instant`}
          {status === "error" && "⚠️ Failed to load index"}
        </p>*/}
      </div>
      {/* Trust + Quick Test BINs section */}
      <div className="w-full max-w-md mb-6">
        {/* Safety banner */}
        <div
          className="rounded-xl mb-4 px-4 py-3 text-center"
          style={{
            background: "#fff9e6",
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            borderRadius: 14,
          }}
        >
          <div className="font-body text-sm text-black/85">
            Your card & bank information is safe. We do not store or view any
            data you enter. View the code{" "}
            <u>
              <a
                target="_blank"
                href="https://github.com/theprogramking/www.lookupabin.com"
              >
                here
              </a>
            </u>
            .
          </div>
        </div>

        {/* Input Card */}
        <div className="neu-card w-full max-w-md p-8 mb-6">
          <label
            htmlFor="bin-input"
            className="block font-display text-xs tracking-widest uppercase text-neu-muted mb-4"
          >
            Bank Identification Number:
          </label>
          <div className="relative">
            <input
              id="bin-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9\s\-]*"
              value={input}
              onChange={handleInput}
              placeholder="4111 1111 1111 1111"
              autoComplete="off"
              autoFocus
              className={`
              neu-input w-full font-display text-2xl tracking-widest text-neu-text
              placeholder:text-neu-dark transition-all duration-200
              ${canLookup ? "text-neu-accent" : ""}
            `}
            />
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="spinner" />
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-neu-muted font-body">
            Enter at least 6 digits — results appear instantly
          </p>
        </div>
        {/* Result Card */}
        {result !== null && (
          <div
            className={`neu-card w-full max-w-md p-6 transition-all duration-300 ${result.found ? "" : "opacity-70"}`}
          >
            {result.found && result.fields ? (
              <>
                {/* Brand badge */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="neu-pill font-display text-lg font-bold text-neu-accent px-4 py-1">
                      {result.fields.Brand || "UNKNOWN"}
                    </div>
                    <span
                      className={`text-xs font-display uppercase tracking-widest px-3 py-1 rounded-full ${
                        result.fields.Type === "CREDIT"
                          ? "bg-purple-100 text-purple-600"
                          : result.fields.Type === "DEBIT"
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {result.fields.Type || "—"}
                    </span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="neu-btn-sm font-body text-xs text-neu-muted flex items-center gap-1"
                  >
                    {copied ? "✅ Copied" : "📋 Copy"}
                  </button>
                </div>

                {/* Fields grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => {
                    const val = result.fields![key];
                    if (!val) return null;
                    const isUrl = key === "IssuerUrl";
                    return (
                      <div
                        key={key}
                        className="neu-field-card p-3 rounded-xl col-span-1"
                      >
                        <div className="text-xs text-neu-muted font-body mb-1 flex items-center gap-1">
                          <span>{FIELD_ICONS[key]}</span>
                          <span>{label}</span>
                        </div>
                        {isUrl ? (
                          <a
                            href={
                              val.startsWith("http") ? val : `https://${val}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-display text-neu-accent truncate block hover:underline"
                          >
                            {val.replace(/^https?:\/\//, "")}
                          </a>
                        ) : (
                          <div className="text-sm font-display text-neu-text truncate">
                            {val}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Raw toggle
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="neu-btn-sm w-full font-body text-xs text-neu-muted"
              >
                {showRaw ? "▲ Hide raw" : "▼ Show raw row"}
              </button> */}
                {showRaw && (
                  <pre className="mt-3 p-3 neu-inset text-xs font-display text-neu-muted break-all whitespace-pre-wrap rounded-xl">
                    {result.rawRow?.split("\x1F").join(" | ")}
                  </pre>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🔍</div>
                <div className="font-display text-neu-muted text-sm">
                  No record found for BIN{" "}
                  <span className="text-neu-accent">{digits.slice(0, 6)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Sample BINs */}
        <div className="neu-card p-4" style={{ marginTop: "25px" }}>
          <div className="mb-3">
            <div
              className="font-display text-sm tracking-widest uppercase text-neu-muted"
              style={{
                fontSize: "12px",
                textAlign: "center",
              }}
            >
              Try BINs from Popular Brands:
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto py-2">
            {/* Cards rendered below */}
            <ScrollingBinRow
              onSelect={(bin: string) => {
                // format into groups of 4 for the input display
                const formatted = bin.replace(/(.{4})/g, "$1 ").trim();
                setInput(formatted);
                setShowRaw(false);
                // trigger lookup immediately
                doLookup(bin);
              }}
            />
          </div>
        </div>
      </div>
      <p
        className="mt-8 text-xs text-neu-muted font-body text-center opacity-60"
        style={{ color: "#ffffff" }}
      >
        Offline · No API calls · Data stays in your browser
      </p>
    </div>
  );
}
