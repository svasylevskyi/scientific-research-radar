export const passwordRequirementsText =
  "Use 8–128 characters, including at least one uppercase letter (A–Z), one lowercase letter (a–z), one number (0–9), and one special character (such as !, @, #, or ?). Spaces do not count as special characters.";

export function isValidNewPassword(password: string): boolean {
  const length = Array.from(password).length;
  return length >= 8 && length <= 128 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) &&
    /[!-/:-@\[-`{-~]/.test(password);
}
