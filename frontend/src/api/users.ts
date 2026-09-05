import type { User } from "../types/auth";
import { apiRequest } from "./client";

export interface ProfileUpdateInput {
  full_name: string;
  email: string;
}

export interface PasswordUpdateInput {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}

export const usersApi = {
  updateProfile(input: ProfileUpdateInput): Promise<User> {
    return apiRequest<User>("/users/me", { method: "PATCH", body: input });
  },

  updatePassword(input: PasswordUpdateInput): Promise<{ message: string }> {
    return apiRequest<{ message: string }>("/users/me/password", {
      method: "PUT",
      body: input,
    });
  },
};
