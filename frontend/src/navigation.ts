/** Page metadata shared by document titles and section-aware navigation. */
const pages = [
  ["/", "Home", "/"],
  ["/about", "About Radar", "/about"],
  ["/contact", "Contact us", "/contact"],
  ["/plans", "Research plans", "/plans"],
  ["/register/plan", "Choose your research plan", "/plans"],
  ["/privacy", "Privacy notice", "/privacy"],
  ["/terms", "Terms of use", "/terms"],
  ["/login", "Sign in", "/login"],
  ["/register", "Create your account", "/register"],
  ["/forgot-password", "Forgot your password", "/forgot-password"],
  ["/reset-password", "Reset your password", "/reset-password"],
  ["/profile", "Your profile", "/profile"],
  ["/radar", "Your workspace", "/radar"],
  ["/digests/new", "Create a digest", "/radar"],
  ["/digests/:digestId", "Digest details and research", "/radar"],
  ["/digests/:digestId/history", "Digest run history", "/radar"],
  ["/subscription", "Subscription and usage", "/subscription"],
  ["/admin/users", "User management", "/admin/users"],
  ["/admin/users/:userId", "User details · Admin", "/admin/users"],
  ["/admin/digests", "Digest management", "/admin/digests"],
  ["/admin/digests/:digestId", "Digest details · Admin", "/admin/digests"],
  ["/admin/digests/:digestId/runs", "Digest run history · Admin", "/admin/digests"],
  ["/admin/messages", "Contact messages · Admin", "/admin/messages"],
  ["/admin/subscription-plans", "Plan management", "/admin/subscription-plans"],
  ["/admin/subscription-plans/new", "Create a plan", "/admin/subscription-plans"],
  ["/admin/subscription-plans/:code/edit", "Edit plan revision", "/admin/subscription-plans"],
  ["/admin/pricing", "Pricing management", "/admin/pricing"],
  ["/admin/pricing/new", "Publish pricing version", "/admin/pricing"],
  ["/admin/pricing/:priceId/copy", "Copy pricing version", "/admin/pricing"],
  ["/admin/spending", "OpenAI spending · Admin", "/admin/pricing"],
  ["/admin/subscription-access", "Subscription access · Admin", ""],
  ["/admin/subscription-observation", "Subscription observation · Admin", ""],
  ["/admin/billing-sync", "Billing synchronization · Admin", ""],
  ["/admin/subscription-testing", "Billing · Admin", ""],
] as const;

export function pageNavigation(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/");
  const page = pages.find(([pattern]) => {
    const parts = pattern.split("/");
    return parts.length === segments.length && parts.every((part, index) =>
      part.startsWith(":") ? Boolean(segments[index]) : part === segments[index]);
  });
  return {
    title: `${page?.[1] ?? "Page not found"} | Scientific Research Radar`,
    activeLink: page?.[2] ?? "",
    admin: path.startsWith("/admin/"),
  };
}

export function navigationCurrent(pathname: string, destination: string) {
  if (pageNavigation(pathname).activeLink !== destination) return undefined;
  return (pathname.replace(/\/+$/, "") || "/") === destination ? "page" as const : "location" as const;
}
