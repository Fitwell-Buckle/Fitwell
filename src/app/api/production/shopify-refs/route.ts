import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getShopifyClient } from "@/lib/shopify/client";

export interface ShopifyRef {
  id: string;
  name: string;
}

export interface ShopifyRefs {
  // Warehouses (Shopify locations). Companies are now our own list; market removed.
  locations: ShopifyRef[];
  // Which lists couldn't be loaded (e.g. missing read_locations scope), for a UI hint.
  unavailable: string[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getShopifyClient();
  const result: ShopifyRefs = { locations: [], unavailable: [] };

  try {
    result.locations = await client.getLocations();
  } catch (err) {
    console.error("getLocations failed:", err);
    result.unavailable.push("warehouses");
  }

  return NextResponse.json({ data: result });
}
