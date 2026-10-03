import { NextResponse } from "next/server";

import {
  createOrganizationWithOwner,
  getVisibleOrganizationStatus,
} from "../../../../lib/organizations/server";
import { createClient } from "../../../../lib/supabase/server";

async function getMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as { organization_id: string; role: "owner" | "member" };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = !error ? data?.claims : null;

    if (!claims || typeof claims.sub !== "string") {
      return NextResponse.json({ authenticated: false });
    }

    let membership = await getMembership(supabase, claims.sub);

    if (!membership) {
      const organizationStatus = await getVisibleOrganizationStatus();

      if (organizationStatus.success && !organizationStatus.hasOrganization) {
        await createOrganizationWithOwner("OmniBox Workspace");
        membership = await getMembership(supabase, claims.sub);
      }
    }

    let organization: { id: string; name: string } | null = null;

    if (membership) {
      const { data: organizations } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", membership.organization_id)
        .limit(1);

      if (Array.isArray(organizations) && organizations.length === 1) {
        organization = organizations[0] as { id: string; name: string };
      }
    }

    const email = typeof claims.email === "string" ? claims.email : "";
    const metadata =
      claims.user_metadata && typeof claims.user_metadata === "object"
        ? (claims.user_metadata as Record<string, unknown>)
        : {};
    const name =
      typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : email.split("@")[0] || "スタッフ";

    const roleKey = membership?.role ?? "member";

    return NextResponse.json({
      authenticated: true,
      user: {
        id: claims.sub,
        email,
        name,
        role: roleKey === "owner" ? "管理者" : "従業員",
        roleKey,
      },
      organization,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
