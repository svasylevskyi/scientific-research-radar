import { Fragment, type ReactNode } from "react";
import { Box, Link, List, ListItem, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

function safeHref(value: string): string | null {
  const href = value.trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function inline(value: string, keyPrefix: string): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  return value.split(token).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Box component="strong" key={key} sx={{ fontWeight: 750 }}>{part.slice(2, -2)}</Box>;
    }
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const label = match?.[1];
    const rawHref = match?.[2];
    if (label !== undefined && rawHref !== undefined) {
      const href = safeHref(rawHref);
      if (!href) return <Fragment key={key}>{label}</Fragment>;
      if (href.startsWith("/")) return <Link component={RouterLink} to={href} key={key}>{label}</Link>;
      return <Link href={href} key={key} {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noreferrer" })}>{label}</Link>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "heading"; level: 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function blocks(markdown: string): Block[] {
  const result: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) result.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) result.push({ kind: "list", ordered: list.ordered, items: [...list.items] });
    list = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading?.[1] && heading[2]) {
      flushParagraph();
      flushList();
      const level = Math.min(4, heading[1].length + 1) as 2 | 3 | 4;
      result.push({ kind: "heading", level, text: heading[2] });
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      result.push({ kind: "quote", text: line.slice(2).trim() });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const item = numbered?.[1] ?? bullet?.[1];
    if (item !== undefined) {
      flushParagraph();
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return result;
}

export function BasicMarkdown({ markdown }: { markdown: string }) {
  return <Stack spacing={2.25} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
    {blocks(markdown).map((block, index) => {
      const key = `content-${index}`;
      if (block.kind === "heading") {
        const component = `h${block.level}` as "h2" | "h3" | "h4";
        return <Typography key={key} component={component} variant={block.level === 2 ? "h6" : "subtitle1"}
          sx={{ mt: index ? 1.5 : 0, fontWeight: 750 }}>{inline(block.text, key)}</Typography>;
      }
      if (block.kind === "quote") {
        return <Box key={key} component="blockquote" sx={{ m: 0, pl: 2, borderLeft: "3px solid", borderColor: "divider" }}>
          <Typography color="text.secondary">{inline(block.text, key)}</Typography>
        </Box>;
      }
      if (block.kind === "list") {
        return <List key={key} component={block.ordered ? "ol" : "ul"} disablePadding
          sx={{ pl: 3.5, listStyleType: block.ordered ? "decimal" : "disc" }}>
          {block.items.map((item, itemIndex) => <ListItem key={`${key}-${itemIndex}`} component="li"
            sx={{ display: "list-item", py: 0.35, px: 0 }}>
            <Typography>{inline(item, `${key}-${itemIndex}`)}</Typography>
          </ListItem>)}
        </List>;
      }
      return <Typography key={key}>{inline(block.text, key)}</Typography>;
    })}
  </Stack>;
}
