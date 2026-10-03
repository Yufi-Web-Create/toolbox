import { redirect } from "next/navigation";

import { getVisibleOrganizationStatus } from "../../lib/organizations/server";
import { createClient } from "../../lib/supabase/server";
import { OmniBoxShell } from "./omnibox-shell";
import styles from "./section-page.module.css";

type ActiveSection = "publish" | "templates" | "channels" | "analytics";

type SectionPageProps = {
  active: ActiveSection;
  title: string;
  description: string;
  children: React.ReactNode;
};

export async function SectionPage({
  active,
  title,
  description,
  children,
}: SectionPageProps) {
  let claims: Record<string, unknown> | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    claims = !error && data?.claims ? (data.claims as Record<string, unknown>) : null;
  } catch {
    claims = null;
  }

  if (!claims) {
    redirect(`/login?next=/app/${active}`);
  }

  const organizationStatus = await getVisibleOrganizationStatus();

  if (!organizationStatus.success) {
    return (
      <OmniBoxShell active={active} userEmail={String(claims.email ?? "")}>
        <main className={styles.page}>
          <section className={styles.errorCard}>
            <h1>画面を開けませんでした</h1>
            <p>{organizationStatus.message}</p>
          </section>
        </main>
      </OmniBoxShell>
    );
  }

  if (!organizationStatus.hasOrganization) {
    redirect("/app/onboarding");
  }

  return (
    <OmniBoxShell active={active} userEmail={String(claims.email ?? "")}>
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </section>
        {children}
      </main>
    </OmniBoxShell>
  );
}
