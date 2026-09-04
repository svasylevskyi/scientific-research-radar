import type { User, UserRole } from "../types/auth";
import { apiRequest } from "./client";

export interface UserListResponse {
  items: User[];
  total: number;
  offset: number;
  limit: number;
}

export interface AdminUserUpdate {
  email?: string;
  full_name?: string;
  is_active?: boolean;
}

export const adminApi = {
  listUsers(params: { offset: number; limit: number; query?: string }): Promise<UserListResponse> {
    const search = new URLSearchParams({
      offset: String(params.offset),
      limit: String(params.limit),
    });
    if (params.query) search.set("q", params.query);
    return apiRequest<UserListResponse>(`/admin/users?${search}`);
  },

  getUser(userId: string): Promise<User> {
    return apiRequest<User>(`/admin/users/${userId}`);
  },

  updateUser(userId: string, input: AdminUserUpdate): Promise<User> {
    return apiRequest<User>(`/admin/users/${userId}`, { method: "PATCH", body: input });
  },

  updateRole(userId: string, role: UserRole): Promise<User> {
    return apiRequest<User>(`/admin/users/${userId}/role`, {
      method: "PUT",
      body: { role },
    });
  },

  deleteUser(userId: string): Promise<void> {
    return apiRequest<void>(`/admin/users/${userId}`, { method: "DELETE" });
  },
};
