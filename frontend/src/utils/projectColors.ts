export const projectPalette = [
  "#4F46E5",
  "#0891B2",
  "#16A34A",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#DC2626",
  "#0F766E",
  "#2563EB",
  "#9333EA",
];

export function getProjectColor(projectId: number) {
  return projectPalette[Math.abs(projectId) % projectPalette.length];
}
