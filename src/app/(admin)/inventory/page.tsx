import { redirect } from "next/navigation";

// Incoming inventory now lives as a view inside the Production Summary page.
// Keep this route as a redirect so existing links/bookmarks still resolve.
export default function InventoryRedirect() {
  redirect("/modules/production/summary");
}
