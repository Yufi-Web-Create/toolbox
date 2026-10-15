import { redirect } from "next/navigation";

export default function RetiredXChatLabPage() {
  // X integration is now strictly publishing-only.
  redirect("/");
}
