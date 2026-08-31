import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

interface ColorSettingProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
}

/**
 * One "label + swatch + popover color picker" row — every color field in
 * `SettingsPanel` (candle up/down, backgrounds, gridlines, the crosshair
 * tag, ...) renders through this same component rather than each getting
 * its own hand-built popover, which is the settings panel's equivalent of
 * the shape-primitive reuse the chart engine itself leans on: one small
 * building block, instantiated per field, instead of duplicated markup
 * eight times over. (A settings *row* doesn't have the "specialize by
 * subclassing" shape that `Shape` → `Rectangle`/`Triangle` does — there's
 * no varying geometry or draw behavior here, just the same row reused
 * with different data — so plain composition is the right-sized version
 * of that same idea for a React component instead of a class hierarchy.)
 *
 * The popover is a plain absolutely-positioned div rather than a
 * portal/library modal — this app has exactly one settings surface open
 * at a time (see `SettingsPanel`'s own single `activeField` bit of
 * state), so there's nothing a heavier popover primitive would buy here.
 */
export function ColorSetting({ label, color, onChange }: ColorSettingProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click, same as any popover - without this the
  // picker would stay open until the gear button itself was toggled.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="color-setting" ref={containerRef}>
      <span className="color-setting-label">{label}</span>
      <button
        type="button"
        className="color-setting-swatch"
        style={{ backgroundColor: color }}
        aria-label={`Choose color for ${label}`}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="color-setting-popover">
          <HexColorPicker color={color} onChange={onChange} />
          <input
            className="color-setting-hex"
            type="text"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
