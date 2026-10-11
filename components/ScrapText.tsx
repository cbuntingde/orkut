import { parseScrap, type ScrapEl, type ScrapNode, type ScrapTag } from "@/lib/scrap-format";

/**
 * Renders a parsed scrap as React elements.
 *
 * There is no dangerouslySetInnerHTML anywhere in this file. Tags become React
 * elements and colours become inline style objects that only ever contain a
 * value that already passed the sanitizer in lib/scrap-format.ts, so a scrap
 * cannot inject markup or CSS no matter what it contains.
 */
export default function ScrapText({ body, className }: { body: string; className?: string }) {
  return <span className={className}>{render(parseScrap(body), { fontWeight: undefined, fontStyle: undefined, textDecoration: undefined, color: undefined })}</span>;
}

type Style = {
  fontWeight?: number;
  fontStyle?: "italic";
  textDecoration?: string;
  color?: string;
};

function styleFor(tag: ScrapTag, value: string | undefined, parent: Style): Style {
  const next: Style = { ...parent };
  if (tag === "b") next.fontWeight = 700;
  if (tag === "i") next.fontStyle = "italic";
  if (tag === "u") next.textDecoration = parent.textDecoration ? `${parent.textDecoration} underline` : "underline";
  if (tag === "color" && value) next.color = value;
  return next;
}

function render(nodes: ScrapNode[], style: Style) {
  return nodes.map((node, i) => {
    if (node.kind === "text") return <span key={i}>{node.value}</span>;

    if (node.kind === "smiley") {
      return (
        <span key={i} role="img" aria-label={node.alt} title={node.alt} className="whitespace-nowrap">
          {node.glyph}
        </span>
      );
    }

    const el = node as ScrapEl;
    const childStyle = styleFor(el.tag, el.value, style);
    const inner = render(el.children, childStyle);

    if (el.tag === "link") {
      return (
        <a
          key={i}
          href={el.value}
          target="_blank"
          rel="noopener noreferrer nofollow"
          style={{ color: "#ed2590", textDecoration: "underline" }}
        >
          {inner}
        </a>
      );
    }

    return (
      <span key={i} style={childStyle}>
        {inner}
      </span>
    );
  });
}