export type AccentColor = {
  name: string;
  value: string;
  soft: string;
  text: string;
};

export const ACCENT_STORAGE_KEY = "smart_planner_accent";

export const accentColors: AccentColor[] = [
  {
    name: "French Violet",
    value: "#70789B",
    soft: "#E7EAF3",
    text: "#2F354D",
  },
  {
    name: "Blueberry Popover",
    value: "#7E879F",
    soft: "#E9ECF3",
    text: "#30384C",
  },
  {
    name: "Vesper Violet",
    value: "#9DA4B7",
    soft: "#EFF1F6",
    text: "#384052",
  },
  {
    name: "Purple Gray",
    value: "#8E8AA6",
    soft: "#ECEAF3",
    text: "#39364C",
  },
  {
    name: "Payne Gray",
    value: "#4C5C68",
    soft: "#E5EBEF",
    text: "#24313A",
  },
  {
    name: "Muted Slate",
    value: "#6D7988",
    soft: "#E8EDF2",
    text: "#2F3A45",
  },
];

export const defaultAccent = accentColors[1];

export function getStoredAccent(): AccentColor {
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  return accentColors.find((color) => color.value === stored) ?? defaultAccent;
}

export function storeAccent(value: string) {
  localStorage.setItem(ACCENT_STORAGE_KEY, value);
  window.dispatchEvent(new Event("smart-planner-accent-change"));
}
