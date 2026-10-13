import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import XChatLabClient from "./XChatLabClient";

export const dynamic = "force-dynamic";

export default async function XChatLabPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data.claims?.sub) redirect("/login?next=/app/xchat-lab");
  return <XChatLabClient />;
}
