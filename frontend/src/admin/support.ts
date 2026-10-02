import type { User } from "../types/auth";

/** Display only server-provided timestamps, interpreting legacy naive stamps as UTC. */
export function adminDate(value?: string | null): string {
  if (!value) return "Not available";
  const stamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(stamp);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Not available";
}

export function listRange(page: number, pageSize: number, total: number, count: number, noun: string): string {
  if (!total) return `0 ${noun}`;
  const first = (page - 1) * pageSize + 1;
  if (!count || first > total) return `No items on this page · ${total} ${noun} in total`;
  return `${first}–${Math.min(first + count - 1, total)} of ${total} ${noun}`;
}

/** Navigation only: never trust a supplied return URL as an authorization or identity claim. */
export function safeSupportReturn(value: string | null): string | null {
  if (!value || value.length > 8192 || /[\\\u0000-\u001f\u007f#]/.test(value)) return null;
  const path = value.split("?")[0];
  return /^\/admin\/(?:messages|users(?:\/[a-zA-Z0-9-]+)?|digests)$/.test(path) ? value : null;
}

export function supportReturnLabel(path: string): string {
  if (path.split("?")[0] === "/admin/messages") return "Back to contact messages";
  if (/^\/admin\/users\//.test(path)) return "Back to user details";
  if (path.split("?")[0] === "/admin/users") return "Back to users";
  return "Back to digests";
}

export function matchingUsersPath(email: string, messagesPath: string): string {
  // The existing user search API accepts at most 120 characters. A partial
  // match is only a lead for a human operator, never an identity verification.
  const params = new URLSearchParams({ query: email.trim().slice(0, 120) });
  const back = safeSupportReturn(messagesPath);
  if (back) params.set("support_return", back);
  return `/admin/users?${params}`;
}

export function withSupportReturn(path: string, origin: string): string {
  const [pathname, query] = path.split("?");
  const params = new URLSearchParams(query);
  const back = safeSupportReturn(origin);
  if (back) params.set("support_return", back);
  return params.size ? `${pathname}?${params}` : pathname;
}

export type AccountDraft = Pick<User, "full_name" | "email" | "is_active">;
export type AccountEditor = { user: User; draft: AccountDraft };
export function accountDraft(user: User): AccountDraft {
  return { full_name: user.full_name, email: user.email, is_active: user.is_active };
}
export function hasAccountEdits(editor: AccountEditor): boolean {
  return editor.draft.full_name !== editor.user.full_name || editor.draft.email !== editor.user.email ||
    editor.draft.is_active !== editor.user.is_active;
}
export function receiveAccount(editor: AccountEditor | null, user: User): AccountEditor {
  return { user, draft: editor?.user.id === user.id && hasAccountEdits(editor) ? editor.draft : accountDraft(user) };
}
