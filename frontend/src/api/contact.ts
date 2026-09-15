import { apiRequest } from "./client";
import type { components } from "../types/api.generated";

type Schemas = components["schemas"];
export type ContactMessage = Schemas["ContactMessageRead"];
export const contactApi = {
  send: (body: Schemas["ContactMessageCreate"]) => apiRequest<Schemas["ContactMessageReceipt"]>("/contact", { method: "POST", body, authenticate: false }),
  list: (page: number) => apiRequest<Schemas["ContactMessageList"]>(`/admin/messages?offset=${(page - 1) * 20}&limit=20`),
  review: (id: string, reviewed: boolean) => apiRequest<ContactMessage>(`/admin/messages/${id}`, { method: "PATCH", body: { reviewed } }),
};
