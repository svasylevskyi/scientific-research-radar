import { radarPathname } from "./workspaceRoutes";

/** Page metadata shared by document titles and section-aware navigation. */
const pages = [
  ["/", "Home", "/"],
  ["/about", "About Radar", "/about"],
  ["/contact", "Contact us", "/contact"],
  ["/plans", "Research plans", "/plans"],
  ["/radar/register/plan", "Choose your research plan", "/radar/subscription"],
  ["/radar/plans", "Research plans", "/radar/subscription"],
  ["/privacy", "Privacy notice", "/privacy"],
  ["/terms", "Terms of use", "/terms"],
  ["/radar/login", "Sign in", "/radar/login"],
  ["/radar/register", "Create your account", "/radar/register"],
  ["/radar/forgot-password", "Forgot your password", "/radar/forgot-password"],
  ["/radar/reset-password", "Reset your password", "/radar/reset-password"],
  ["/radar/profile", "Your profile", "/radar/profile"],
  ["/radar", "Your workspace", "/radar"],
  ["/radar/contact", "Contact us", "/radar/contact"],
  ["/radar/digests/new", "Create a digest", "/radar"],
  ["/radar/digests/:digestId", "Digest details and research", "/radar"],
  ["/radar/digests/:digestId/history", "Digest run history", "/radar"],
  ["/radar/subscription", "Subscription and usage", "/radar/subscription"],
  ["/admin/users", "User management", "/admin/users"],
  ["/admin/users/:userId", "User details · Admin", "/admin/users"],
  ["/admin/digests", "Digest management", "/admin/digests"],
  ["/admin/digests/:digestId", "Digest details · Admin", "/admin/digests"],
  ["/admin/digests/:digestId/runs", "Digest run history · Admin", "/admin/digests"],
  ["/admin/messages", "Contact messages · Admin", "/admin/messages"],
  ["/admin/research-quality", "Research quality · Admin", "/admin/research-quality"],
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
  const path = radarPathname(pathname);
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
  return radarPathname(pathname) === destination ? "page" as const : "location" as const;
}

type PageLocation = {
  key: string;
  pathname: string;
  hash: string;
  state?: { scrollToTop?: boolean } | null;
};

export function shouldResetPageScroll(
  previous: PageLocation,
  next: PageLocation,
  navigationType: "POP" | "PUSH" | "REPLACE",
): boolean {
  // Initial renders and browser history keep the browser's scroll behavior.
  if (previous.key === next.key || navigationType === "POP") return false;
  // Main-menu selections also return to the top when reselecting this page.
  if (next.state?.scrollToTop) return true;
  // Tabs/filters stay in place; explicit section links handle their own scrolling.
  return previous.pathname !== next.pathname && !next.hash;
}
