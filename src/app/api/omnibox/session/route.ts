import { NextResponse } from "next/server";

import { createOrganizationWithOwner } from "../../../../lib/organizations/server";
import { createClient } from "../../../../lib/supabase/server";

type Membership = {
  organization_id: string;
  role: "owner" | "member";
};

async function getMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as Membership;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = !error ? data?.claims : null;

    if (!claims || typeof claims.sub !== "string") {
      return NextResponse.json({ authenticated: false });
    }

    const metadata =
      claims.user_metadata && typeof claims.user_metadata === "object"
        ? (claims.user_metadata as Record<string, unknown>)
        : {};
    const accountType =
      metadata.account_type === "member" ? "member" : "owner";
    const isDemo = metadata.demo_account === true;

    let membership = await getMembership(supabase, claims.sub);

    // A newly-created administrator owns a workspace, but must complete its
    // human-facing organization name/login ID before normal app use.
    if (!membership && accountType === "owner") {
      const created = await createOrganizationWithOwner("OmniBox Workspace");
      if (created.success) {
        membership = await getMembership(supabase, claims.sub);
      }
    }

    let organization: {
      id: string;
      name: string;
      loginId: string | null;
    } | null = null;

    if (membership) {
      const { data: organizations } = await supabase
        .from("organizations")
        .select("id, name, login_id")
        .eq("id", membership.organization_id)
        .limit(1);

      if (Array.isArray(organizations) && organizations.length === 1) {
        organization = {
          id: organizations[0].id,
          name: organizations[0].name,
          loginId: organizations[0].login_id ?? null,
        };
      }
    }

    const email = typeof claims.email === "string" ? claims.email : "";
    const name =
      typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : email.split("@")[0] || "スタッフ";

    const roleKey = membership?.role ?? accountType;
    const requiresOrganizationSetup =
      roleKey === "owner" && (!organization || !organization.loginId);

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
      requiresOrganizationSetup,
      membershipReady: Boolean(membership),
      isDemo,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
