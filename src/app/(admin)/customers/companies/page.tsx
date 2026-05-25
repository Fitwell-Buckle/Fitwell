import { redirect } from "next/navigation";

// "Companies" was renamed to "Brands". Keep this path as a redirect so old
// links/bookmarks still resolve.
export default function CompaniesRedirect() {
  redirect("/customers/brands");
}
