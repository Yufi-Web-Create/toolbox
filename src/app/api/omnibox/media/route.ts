import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const userId =
      !claimsError && typeof claimsData?.claims?.sub === "string"
        ? claimsData.claims.sub
        : null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "ログインが必要です。" },
        { status: 401 },
      );
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1);

    if (
      membershipError ||
      !Array.isArray(memberships) ||
      memberships.length !== 1
    ) {
      return NextResponse.json(
        { ok: false, message: "所属組織を確認できませんでした。" },
        { status: 403 },
      );
    }

    const organizationId = String(memberships[0].organization_id);
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);

    if (files.length === 0 || files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, message: "画像は1〜10枚で選択してください。" },
        { status: 400 },
      );
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          { ok: false, message: "JPEG・PNG・WebP画像を選択してください。" },
          { status: 400 },
        );
      }
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { ok: false, message: "画像1枚あたり10MB以下にしてください。" },
          { status: 400 },
        );
      }
    }

    const uploadedPaths: string[] = [];
    const urls: string[] = [];

    try {
      for (const file of files) {
        const path =
          `${organizationId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(file.type)}`;

        const { error: uploadError } = await supabase.storage
          .from("social-post-media")
          .upload(path, file, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;
        uploadedPaths.push(path);

        const { data: publicData } = supabase.storage
          .from("social-post-media")
          .getPublicUrl(path);
        urls.push(publicData.publicUrl);
      }
    } catch {
      await Promise.all(
        uploadedPaths.map((path) =>
          supabase.storage.from("social-post-media").remove([path]),
        ),
      );
      return NextResponse.json(
        { ok: false, message: "画像をアップロードできませんでした。" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, urls });
  } catch {
    return NextResponse.json(
      { ok: false, message: "画像をアップロードできませんでした。" },
      { status: 500 },
    );
  }
}
