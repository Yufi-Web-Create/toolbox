import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request:Request){
  try{
    const payload=await request.json();
    const id=typeof payload?.connectionId==="string"?payload.connectionId:"";
    if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({ok:false,message:"連携先を選んでください。"},{status:400});
    const db=await createClient();
    const {data:claims,error}=await db.auth.getClaims();
    if(error||typeof claims?.claims?.sub!=="string")return NextResponse.json({ok:false},{status:401});
    const {data:sessionData}=await db.auth.getSession();
    const token=sessionData.session?.access_token;
    const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if(!base||!token)return NextResponse.json({ok:false,message:"ログインし直してください。"},{status:401});
    const response=await fetch(new URL("/functions/v1/omnibox-instagram-history",base),{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({connectionId:id}),cache:"no-store",
    });
    const result=await response.json();
    return NextResponse.json(result,{status:response.status});
  }catch{
    return NextResponse.json({ok:false,message:"Instagram履歴同期に失敗しました。"},{status:502});
  }
}
