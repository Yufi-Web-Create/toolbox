import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

async function membership() {
  const db = await createClient();
  const { data: claims, error } = await db.auth.getClaims();
  const uid = !error && typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!uid) return { db, uid: null, member: null };
  const { data, error: memberError } = await db.from("organization_members")
    .select("organization_id,role").eq("user_id",uid).limit(1);
  return { db, uid, member: !memberError && data?.length === 1 ? data[0] : null };
}
export async function GET() {
  const { db, uid, member } = await membership();
  if (!uid) return NextResponse.json({ok:false},{status:401});
  if (!member) return NextResponse.json({ok:false},{status:403});
  const { data,error } = await db.from("organization_ai_context")
    .select("business_information,writing_instructions,updated_at")
    .eq("organization_id",member.organization_id).maybeSingle();
  if(error) return NextResponse.json({ok:false,message:"AI設定を読み込めませんでした。"},{status:500});
  return NextResponse.json({ok:true,context:data??{business_information:"",writing_instructions:""}});
}
export async function PUT(request:Request) {
  const {db,uid,member}=await membership();
  if (!uid) return NextResponse.json({ok:false},{status:401});
  if (!member || member.role!=="owner") return NextResponse.json({ok:false,message:"管理者だけが変更できます。"},{status:403});
  const data=await request.json().catch(()=>null);
  const business=typeof data?.businessInformation==="string"?data.businessInformation.trim():null;
  const instructions=typeof data?.writingInstructions==="string"?data.writingInstructions.trim():null;
  if(business===null || instructions===null || business.length>12000 || instructions.length>6000){
    return NextResponse.json({ok:false,message:"店舗情報は12000文字、AI指示は6000文字以内で入力してください。"},{status:400});
  }
  const {error}=await db.from("organization_ai_context").upsert({
    organization_id:member.organization_id,business_information:business,
    writing_instructions:instructions,updated_at:new Date().toISOString(),updated_by:uid
  },{onConflict:"organization_id"});
  if(error) return NextResponse.json({ok:false,message:"AI設定を保存できませんでした。"},{status:500});
  return NextResponse.json({ok:true});
}
