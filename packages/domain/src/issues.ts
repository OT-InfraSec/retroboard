import type { Card } from "./types";

export const ISSUE_LABEL = "retro";
const TITLE_MAX = 50;

/** First sentence of the text, cut to ~50 characters with an ellipsis (SPEC §8.2). */
export function defaultIssueTitle(text: string): string {
  const flat = text.trim();
  const sentence = flat.split(/(?<=[.!?])\s+|\n/)[0]!.trim();
  return sentence.length > TITLE_MAX ? `${sentence.slice(0, TITLE_MAX).trimEnd()}…` : sentence;
}

export function deepLink(baseUrl: string, boardId: string, topicId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/boards/${encodeURIComponent(boardId)}?topic=${encodeURIComponent(topicId)}`;
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

export function composeIssue(input: {
  /** Cards of the topic; for a group the earliest card provides the default title. */
  cards: Card[];
  title?: string;
  description?: string;
  link: string;
}): IssueDraft {
  const cards = [...input.cards].sort((a, b) => a.createdAt - b.createdAt);
  const explicit = input.title?.trim();
  const title = explicit || defaultIssueTitle(cards[0]?.text ?? "");
  const parts = [
    cards.length > 1 ? cards.map((c) => `- ${c.text}`).join("\n") : (cards[0]?.text ?? ""),
  ];
  if (input.description?.trim()) parts.push(input.description.trim());
  parts.push(`[Open this topic in Retroboard](${input.link})`);
  return { title, body: parts.join("\n\n"), labels: [ISSUE_LABEL] };
}
