import { apiRequest } from "../api/client";

export type PublicContentSlug = "about" | "privacy" | "terms";

export interface PublicContentRevision {
  slug: PublicContentSlug;
  revision: number;
  title: string;
  body_markdown: string;
  change_note: string;
  created_by_name: string;
  created_at: string;
}

export interface PublicContentHistory {
  items: PublicContentRevision[];
  total: number;
  offset: number;
  limit: number;
}

export function loadPublicContent(slug: PublicContentSlug, signal?: AbortSignal) {
  return apiRequest<PublicContentRevision | null>(`/content/${slug}`, {
    authenticate: false,
    signal,
  });
}

export function loadAdminContent(slug: PublicContentSlug, signal?: AbortSignal) {
  return apiRequest<PublicContentRevision | null>(`/admin/content-pages/${slug}`, { signal });
}

export function publishAdminContent(
  slug: PublicContentSlug,
  payload: { expected_revision: number; title: string; body_markdown: string; change_note: string },
) {
  return apiRequest<PublicContentRevision>(`/admin/content-pages/${slug}`, {
    method: "PUT",
    body: payload,
  });
}
