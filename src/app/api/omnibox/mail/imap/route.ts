import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { normalizeMailSettings, resolvePublicMailHost } from "../../../../../lib/mail/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claims, error } = await supabase.auth.getClaims();
    const userId = !error ? claims?.claims?.sub : null;
    if (typeof userId !== "string") return NextResponse.json({ok:false,message:"ログインが必要です。"},{status:401});
    const {data: memberships} = await supabase.from("organization_members")
      .select("organization_id,role").eq("user_id",userId).limit(1);
    if (!Array.isArray(memberships) || memberships.length !== 1 ||
        memberships[0].role !== "owner") {
      return NextResponse.json({ok:false,message:"管理者のみメールを連携できます。"},{status:403});
    }
    const p = await request.json().catch(() => null);
    const action = p?.action === "save" ? "save" : "test";
    let settings;
    try { settings = normalizeMailSettings(p); }
    catch { return NextResponse.json({ok:false,message:"メールアドレス、サーバー、認証情報を確認してください。"},{status:400}); }

    const [imapIp,smtpIp] = await Promise.all([
      resolvePublicMailHost(settings.imapHost),
      resolvePublicMailHost(settings.smtpHost),
    ]);
    const { ImapFlow } = await import("imapflow");
    const mail = await import("nodemailer");
    const client = new ImapFlow({
      host: imapIp, port:993, secure:true,
      auth:{ user:settings.username,pass:settings.password },
      tls:{ servername:settings.imapHost,rejectUnauthorized:true },
      logger:false, greetingTimeout:8000, socketTimeout:8000,
      connectionTimeout:8000,
    });
    try {
      await client.connect();
    } finally {
      try { await client.logout(); } catch { /* close even if login failed */ }
    }

    const transport=mail.createTransport({
      host:smtpIp,port:settings.smtpPort,
      secure:settings.smtpPort===465,
      requireTLS:settings.smtpPort===587,
      auth:{user:settings.username,pass:settings.password},
      tls:{servername:settings.smtpHost,rejectUnauthorized:true},
      connectionTimeout:8000,greetingTimeout:8000,socketTimeout:8000,
    });
    try { await transport.verify(); }
    finally { transport.close(); }

    if(action === "test") {
      return NextResponse.json({ok:true,tested:true,message:"IMAP受信・SMTP送信の接続を確認しました。"});
    }
    // Never log or expose credentials. RPC encrypts this JSON in Vault and
    // scopes insertion to the logged-in organization owner.
    const {data: connectionId,error: saveError} = await supabase.rpc("omnibox_store_imap_connection",{
      p_email:settings.email,
      p_display_name:settings.displayName,
      p_secret_json:JSON.stringify({
        version:1,username:settings.username,password:settings.password,
        imapHost:settings.imapHost,smtpHost:settings.smtpHost,
        smtpPort:settings.smtpPort,
      }),
    });
    if(saveError || typeof connectionId!=="string") {
      return NextResponse.json({ok:false,message:"暗号化保存できませんでした。設定を確認してください。"},{status:502});
    }
    return NextResponse.json({ok:true,connectionId,message:"メールアカウントを安全に保存しました。"});
  } catch {
    return NextResponse.json({ok:false,message:"接続確認に失敗しました。サーバー名、認証方式、TLS設定をご確認ください。"},{status:502});
  }
}
