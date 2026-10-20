/** Pastel colour a column is shown in; the web app maps each to a CSS token. */
export type Tone = "red" | "green" | "blue" | "yellow" | "purple" | "teal";

export const TONES: readonly Tone[] = ["red", "green", "blue", "yellow", "purple", "teal"];

export interface Template {
  id: string;
  name: string;
  columns: string[];
  /** One tone per column, chosen to match the column's meaning. */
  tones: Tone[];
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "start-stop-continue",
    name: "Start / Stop / Continue",
    columns: ["Start", "Stop", "Continue"],
    tones: ["green", "red", "blue"],
  },
  {
    id: "went-well",
    name: "Went Well / To Improve / Action Ideas",
    columns: ["Went Well", "To Improve", "Action Ideas"],
    tones: ["green", "yellow", "blue"],
  },
  {
    id: "mad-sad-glad",
    name: "Mad / Sad / Glad",
    columns: ["Mad", "Sad", "Glad"],
    tones: ["red", "blue", "green"],
  },
  {
    id: "4ls",
    name: "4Ls",
    columns: ["Liked", "Learned", "Lacked", "Longed For"],
    tones: ["green", "blue", "red", "purple"],
  },
  {
    id: "sailboat",
    name: "Sailboat",
    columns: ["Wind", "Anchor", "Rocks", "Island"],
    tones: ["green", "yellow", "red", "teal"],
  },
];

export const findTemplate = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);

/**
 * Tone for a column: the template tone when the name matches a template column
 * (case-insensitive), otherwise cycle through the palette by position.
 */
export function columnTone(name: string, index: number): Tone {
  const key = name.trim().toLowerCase();
  for (const t of TEMPLATES) {
    const i = t.columns.findIndex((c) => c.toLowerCase() === key);
    if (i >= 0) return t.tones[i]!;
  }
  return TONES[((index % TONES.length) + TONES.length) % TONES.length]!;
}
