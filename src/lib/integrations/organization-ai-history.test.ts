import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,it,expect} from "vitest";

function file(path:string){return readFileSync(join(process.cwd(),path),"utf8");}

describe("MatoMeet organization scoped AI configuration",()=>{
  const aiReply=file("src/app/api/omnibox/ai/draft/route.ts");
  const aiPost=file("src/app/api/omnibox/ai/post/route.ts");
  const settings=file("src/app/api/omnibox/settings/ai-context/route.ts");
  it("uses stored organization facts in both AI generation routes",()=>{
    for(const source of [aiReply,aiPost]){
      expect(source).toContain(".eq(\"organization_id\", organizationId)");
      expect(source).toContain("businessInformation");
      expect(source).toContain("writingInstructions");
    }
  });
  it("allows only organization owners to change the custom instructions",()=>{
    expect(settings).toContain('member.role!=="owner"');
    expect(settings).toContain(".eq(\"user_id\",uid)");
    expect(settings).toContain("writing_instructions:instructions");
  });
});

describe("Instagram historical messages importer",()=>{
  const source=file("supabase/functions/omnibox-instagram-history/index.ts");
  const sql=file("supabase/migrations/20261018_instagram_historical_ingest.sql");
  it("checks the requesting user's organization and Instagram connection",()=>{
    expect(source).toContain('eq("organization_id",membership.organization_id)');
    expect(source).toContain('eq("provider","instagram")');
  });
  it("imports inbound and outbound history without changing handled state",()=>{
    expect(source).toContain('direction=sender===connection.external_account_id?"outbound":"inbound"');
    expect(sql).toContain("on conflict (organization_id,provider_message_id) do nothing");
    expect(sql).toContain("last_message_at<p_occurred_at");
    expect(sql).toContain("grant execute on function public.omnibox_ingest_instagram_history");
    expect(sql).toContain("to service_role;");
  });
});
