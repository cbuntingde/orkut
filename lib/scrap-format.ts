// Orkut's scrap formatting, the thing that made the scrapbook worth using.
//
//   [red]text[/red]  colour
//   [b][/b] [i][/i] [u][/u]  bold, italic, underline
//   [link=http://x]label[/link]  hyperlink
//   :) :P <3  smileys, written literally
//
// Everything here returns plain data. Rendering happens in components/ScrapText.tsx,
// which builds React elements. There is deliberately no HTML string anywhere in the
// pipeline, so a scrap can never inject markup no matter what a user types.

export type ScrapTag = "b" | "i" | "u" | "color" | "link";

export type ScrapText_ = { kind: "text"; value: string };
export type ScrapSmiley = { kind: "smiley"; glyph: string; alt: string };
export type ScrapEl = { kind: "el"; tag: ScrapTag; value?: string; children: ScrapNode[] };
export type ScrapNode = ScrapText_ | ScrapSmiley | ScrapEl;

// Longest codes first so ":-)" wins over ":)".
const SMILEYS: [string, string, string][] = [
  [":'-(", "😭", "crying"],
  [":'(", "😭", "crying"],
  [":-)", "🙂", "smiling"],
  [":)", "🙂", "smiling"],
  [":-(", "🙁", "sad"],
  [":(", "🙁", "sad"],
  [";-(", "😢", "crying"],
  [";-)", "😢", "crying"],
  [":-D", "😄", "grinning"],
  [";D", "😄", "grinning"],
  [":D", "😄", "grinning"],
  [":-P", "😛", "tongue out"],
  [":P", "😛", "tongue out"],
  ["8)", "😎", "sunglasses"],
  [":-|", "😐", "flat"],
  ["o_O", "😵", "confused"],
  ["^_^", "😊", "happy"],
  ["<3", "❤️", "love"],
  ["</3", "💔", "broken heart"],
];

const SMILEY_RE = new RegExp(
  "(" + SMILEYS.map(([c]) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
  "g"
);
const SMILEY_MAP = new Map(SMILEYS.map(([code, glyph, alt]) => [code, { glyph, alt }]));

// Only hex and the 16 basic CSS keywords. Anything else would let a colour value
// smuggle a CSS declaration into a style attribute, so it is rejected outright.
const NAMED_COLORS = new Set([
  "black", "silver", "gray", "grey", "white", "maroon", "red", "purple", "fuchsia",
  "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "orange", "pink",
]);

export function sanitizeColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
  if (NAMED_COLORS.has(v)) return v;
  return null;
}

// Only http and https. Blocks javascript:, data: and vbscript: URLs.
export function sanitizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  return null;
}

const TAG_RE = /\[(\/?)(b|i|u|color|link)(?:=([^\]]{0,300}))?\]/gi;

/** Splits plain text into text runs and smileys. */
function pushText(out: ScrapNode[], raw: string) {
  if (!raw) return;
  let last = 0;
  SMILEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SMILEY_RE.exec(raw))) {
    if (m.index > last) out.push({ kind: "text", value: raw.slice(last, m.index) });
    const s = SMILEY_MAP.get(m[0]);
    if (s) out.push({ kind: "smiley", glyph: s.glyph, alt: s.alt });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ kind: "text", value: raw.slice(last) });
}

/**
 * Parses a scrap into a tree. Unbalanced and unknown tags are tolerated rather
 * than rejected, which is what the original did: a stray [/red] simply does
 * nothing and the text after it stays red.
 */
export function parseScrap(src: string): ScrapNode[] {
  const root: ScrapNode[] = [];
  const stack: ScrapEl[] = [{ kind: "el", tag: "b", children: root }];
  const top = () => stack[stack.length - 1];

  // A new element must be linked into its parent AND pushed on the stack.
  // Pushing without linking orphans the whole subtree, because nothing else
  // ever points at it.
  const open = (tag: ScrapTag, value?: string) => {
    const el: ScrapEl = { kind: "el", tag, value, children: [] };
    top().children.push(el);
    stack.push(el);
  };

  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = TAG_RE.exec(src))) {
    pushText(top().children, src.slice(last, m.index));
    last = TAG_RE.lastIndex;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase() as ScrapTag;
    const arg = m[3];

    if (closing) {
      // Pop back to the nearest matching open tag. A close with no match is ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    if (tag === "color") {
      // An invalid colour is ignored entirely rather than opened, so its body
      // still renders as ordinary text in the surrounding context.
      const c = sanitizeColor(arg ?? "");
      if (c) open("color", c);
      continue;
    }
    if (tag === "link") {
      const u = sanitizeUrl(arg ?? "");
      if (u) open("link", u);
      continue;
    }
    open(tag);
  }

  pushText(top().children, src.slice(last));
  return root;
}

function collectText(nodes: ScrapNode[], out: string[]) {
  for (const n of nodes) {
    if (n.kind === "text") out.push(n.value);
    else if (n.kind === "smiley") out.push(` ${n.alt} `);
    else collectText(n.children, out);
  }
}

/** Plain-text version, used for accessibility text and search. */
export function stripScrap(src: string): string {
  const out: string[] = [];
  collectText(parseScrap(src), out);
  return out.join("").replace(/\s+/g, " ").trim();
}