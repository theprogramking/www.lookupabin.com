import { useEffect, useState } from "react";

const STORAGE_KEY = "theme-preference";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    } catch (e) {
      /* ignore */
    }
    // default to dark
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore write errors */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="neu-btn-sm"
      style={{
        borderRadius: 6,
        border: `1px solid var(--neu-light)`,
        padding: "8px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
      }}
    >
      {/* Inline SVG icons: sun for light, moon for dark */}
      {theme === "dark" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10 9h2v-3h-2v3zm7.03-2.61l1.79 1.8 1.79-1.8-1.8-1.79-1.78 1.78zM17 11a5 5 0 10-10 0 5 5 0 0010 0zm2.24-6.16l1.79-1.8L19.17 1.17l-1.79 1.8 1.86 1.87zM20 11v2h3v-2h-3z"
            fill="currentColor"
          />
        </svg>
      )}
      <span style={{ fontSize: 13, color: "var(--neu-text)" }}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
