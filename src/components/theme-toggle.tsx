import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  return <Button type="button" variant="outline" size="icon" className="theme-toggle" aria-label="Toggle light or dark mode" title="Toggle light or dark mode" onClick={() => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("trackrank-theme", dark ? "dark" : "light"); } catch {}
  }}><Sun size={16} className="theme-sun" /><Moon size={16} className="theme-moon" /></Button>;
}
