"use server";

import { redirect } from "next/navigation";

import { clearMasterSessionCookie } from "../../lib/master-auth";

export async function masterLogout() {
  await clearMasterSessionCookie();
  redirect("/master-login");
}
