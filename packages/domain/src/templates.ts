export interface Template {
  id: string;
  name: string;
  columns: string[];
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "start-stop-continue",
    name: "Start / Stop / Continue",
    columns: ["Start", "Stop", "Continue"],
  },
  {
    id: "went-well",
    name: "Went Well / To Improve / Action Ideas",
    columns: ["Went Well", "To Improve", "Action Ideas"],
  },
  { id: "mad-sad-glad", name: "Mad / Sad / Glad", columns: ["Mad", "Sad", "Glad"] },
  { id: "4ls", name: "4Ls", columns: ["Liked", "Learned", "Lacked", "Longed For"] },
  { id: "sailboat", name: "Sailboat", columns: ["Wind", "Anchor", "Rocks", "Island"] },
];

export const findTemplate = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);
