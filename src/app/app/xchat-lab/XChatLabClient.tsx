"use client";

import { useEffect, useRef, useState } from "react";
import { unlockExistingXChatSession } from "../../../lib/xchat/browser-unlock";
import { createOfficialChatXdk } from "../../../lib/xchat/official-chat-factory";
import { signingKeysFor, type XChatBrowserSession, type XChatVerifiedMessage } from "../../../lib/xchat/browser-session";

type Connection = { id: string; account_name?: string; provider: string; status: string };
type ApiResult = {
  ok: boolean; message?: string; resource?: string; account_id?: string;
  data?: unknown; meta?: unknown; message_sent?: boolean;
};

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    : [];
}

export default function XChatLabClient() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [status, setStatus] = useState("接続情報を確認しています");
  const [working, setWorking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [preflightReady, setPreflightReady] = useState(false);
  const [pinAttempted, setPinAttempted] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [ownXUserId, setOwnXUserId] = useState("");
  const [availableConversations, setAvailableConversations] = useState<{id: string; label: string}[]>([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [messages, setMessages] = useState<XChatVerifiedMessage[]>([]);
  const [reply, setReply] = useState("");
  const [teamStorageConsent, setTeamStorageConsent] = useState(false);
  const [importCandidates, setImportCandidates] = useState<Array<{ message_id: string; sender_id: string; text: string; occurred_at: string }>>([]);
  const pinRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<XChatBrowserSession | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/omnibox/connections", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw Error("接続アカウントを取得できません");
        if (!active) return;
        const found = (data.connections || []).filter((item: Connection) => item.provider === "x" && item.status === "active");
        setConnections(found);
        setConnectionId(found[0]?.id ?? "");
        setStatus(found.length ? "X Chatの既存鍵を復元できます" : "Xアカウントを接続してください");
      }).catch(() => { if (active) setStatus("Xの接続情報を取得できませんでした"); });
    return () => {
      active = false;
      sessionRef.current?.lock();
      sessionRef.current = null;
    };
  }, []);

  async function request(resource: string, extra: Record<string, unknown> = {}): Promise<ApiResult> {
    const response = await fetch("/api/omnibox/x/sync", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "chat_read", resource, connection_id: connectionId, ...extra }),
    });
    const result: ApiResult = await response.json();
    if (!response.ok || !result.ok) throw Error(result.message || "X Chat APIから情報を取得できません");
    return result;
  }

  async function preflight() {
    if (working || !connectionId || pinAttempted) return;
    setWorking(true);
    setPreflightReady(false);
    setStatus("PINを使わず、既存の鍵バックアップ設定を確認しています");
    try {
      const result = await request("recovery_status");
      const data = result.data && typeof result.data === "object"
        ? result.data as Record<string, unknown> : {};
      if (data.has_public_key_record !== true || data.has_backup_config !== true) {
        setStatus("既存の鍵バックアップが確認できません。PINは入力しないでください");
      } else if (data.has_embedded_realm_tokens !== true) {
        setStatus("復元用の認証トークンを確認できません。PINは入力しないでください");
      } else {
        setPreflightReady(true);
        setStatus("復元用設定を確認しました。PINは一度だけ試してください。失敗したら連続入力せず結果を知らせてください");
      }
    } catch {
      setStatus("復元用設定の事前確認に失敗しました。PINは入力しないでください");
    } finally {
      setWorking(false);
    }
  }

  async function unlock() {
    if (working || !connectionId || !preflightReady || pinAttempted) return;
    setPinAttempted(true);
    const pin = pinRef.current?.value ?? "";
    if (pinRef.current) pinRef.current.value = "";
    if (!pin) { setPinAttempted(false); setStatus("PINを入力してください"); return; }
    setWorking(true);
    setStatus("既存の暗号鍵を端末内で復元しています");
    try {
      const bootstrap = await request("bootstrap");
      const list = records(bootstrap.data);
      if (list.length !== 1) throw Error("公開鍵の登録情報を1件に特定できませんでした");
      const config = list[0].juicebox_config as { token_map?: unknown } | undefined;
      const tokenMap = config?.token_map;
      if (!tokenMap || (Array.isArray(tokenMap) && tokenMap.length === 0)) {
        throw Error("復元用の認証トークンが提供されていません");
      }
      const session = await unlockExistingXChatSession({
        bootstrap: { account_id: bootstrap.account_id, data: list as never[] },
        pin,
        createChat: createOfficialChatXdk,
      });
      sessionRef.current?.lock();
      sessionRef.current = session;
      setUnlocked(true);
      setOwnXUserId(String(bootstrap.account_id || ""));
      setStatus("既存の暗号鍵を復元しました。会話を取得できます");
    } catch {
      setUnlocked(false);
      setStatus("鍵の復元を確認できませんでした。この画面での再試行を停止しました。PINの連続試行は避けてください");
    } finally {
      setWorking(false);
    }
  }

  async function refreshConversations() {
    if (!unlocked || working) return;
    setWorking(true);
    setStatus("X Chatの会話一覧を取得しています");
    try {
      const listing = await request("conversations");
      const found = records(listing.data).map((item, index) => {
        const id = String(item.id || item.conversation_id || "");
        const participants = Array.isArray(item.participant_ids) ? item.participant_ids.join(", ") : "";
        return { id, label: participants ? `会話${index + 1}（${participants}）` : `会話${index + 1}（${id}）` };
      }).filter((item) => item.id.length > 0);
      setAvailableConversations(found);
      setSelectedConversation(found[0]?.id || "");
      setStatus(found.length ? `会話${found.length}件を取得しました。対象を選択してください。`
        : "X Chatの会話がありません");
    } catch {
      setStatus("会話一覧を取得できませんでした");
    } finally {
      setWorking(false);
    }
  }

  async function loadConversation() {
    if (!unlocked || !sessionRef.current || working || !selectedConversation) return;
    setWorking(true);
    setStatus("会話と署名検証用の公開鍵を取得しています");
    try {
      const listing = await request("conversations");
      const conversations = records(listing.data);
      const target = conversations.find((item) => String(item.id || item.conversation_id || "") === selectedConversation);
      const id = String(target?.id || target?.conversation_id || "");
      if (!id) throw Error("選択した会話が見つかりません");
      const eventResult = await request("events", { conversation_id: id });
      const events = records(eventResult.data);
      const encryptedMessages = events
        .map((item) => item.encoded_event ?? item.encoded_message_event ?? item.encoded_message_create_event)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      // Key-change history must precede messages so the official XDK can
      // recover each conversation key and cache it for encrypted replies.
      const meta = eventResult.meta && typeof eventResult.meta === "object"
        ? eventResult.meta as Record<string, unknown> : {};
      const keyChanges = Array.isArray(meta.conversation_key_events)
        ? meta.conversation_key_events
          .map((value: unknown) => typeof value === "string" ? value
            : value && typeof value === "object" && typeof (value as Record<string, unknown>).encoded_event === "string"
            ? String((value as Record<string, unknown>).encoded_event) : "")
          .filter(Boolean) : [];
      const encoded = [...keyChanges, ...encryptedMessages];
      if (!encryptedMessages.length) throw Error("暗号化イベントの形式を確認する必要があります");
      const participants = Array.isArray(target?.participant_ids) ? target.participant_ids
        : Array.isArray(target?.participants) ? target.participants : [];
      const candidateIds = [
        String(listing.account_id || ""),
        ...participants.map((item: unknown) =>
          typeof item === "string" ? item : item && typeof item === "object"
          ? String((item as Record<string, unknown>).id || (item as Record<string, unknown>).user_id || "") : ""),
        ...events.map((event) => String(event.sender_id || "")),
      ];
      const userIds = [...new Set(candidateIds.filter((value) => /^[0-9]{1,24}$/.test(value)))];
      const signingKeys = (await Promise.all(userIds.map(async (userId) => {
        const response = await request("public_keys", { user_id: userId });
        return signingKeysFor(userId, records(response.data) as never[]);
      }))).flat();
      if (!signingKeys.length) throw Error("署名を検証する公開鍵を取得できません");
      sessionRef.current.configureParticipantKeys(signingKeys);
      const verified = sessionRef.current.decryptVerifiedEvents(encoded);
      setMessages(verified);
      const validTime = (value: unknown) =>
        typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
      const importable = verified.flatMap((m) => {
        if (m.senderId === ownXUserId) return [];
        const matching = events.find((event) =>
          String(event.id || event.message_id || "") === m.messageId);
        const occurredAt = validTime(matching?.created_at) ||
          validTime(matching?.timestamp);
        if (!occurredAt || !/^[A-Za-z0-9_-]{1,128}$/.test(m.messageId) ||
          !/^[0-9]{1,24}$/.test(m.senderId)) return [];
        return [{
          message_id: m.messageId, sender_id: m.senderId,
          text: m.text, occurred_at: occurredAt,
        }];
      });
      setImportCandidates(importable);
      setTeamStorageConsent(false);
      setConversationId(id);
      setStatus(verified.length
        ? `署名検証済みのメッセージを${verified.length}件復号しました`
        : "復号可能な署名検証済み本文がありません");
    } catch {
      setStatus("会話の復号に失敗しました。暗号化イベントと鍵更新情報の検証が必要です");
    } finally {
      setWorking(false);
    }
  }

  async function shareWithTeamInbox() {
    if (!unlocked || !teamStorageConsent || !connectionId || !conversationId ||
      !importCandidates.length || working) return;
    setWorking(true);
    setStatus("復号した本文をMatoMeetの共有受信箱へ登録しています");
    try {
      let processed = 0;
      for (let offset = 0; offset < importCandidates.length; offset += 20) {
        const response = await fetch("/api/omnibox/x/sync", {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "chat_import", connection_id: connectionId,
            conversation_id: conversationId,
            explicit_team_storage_consent: true,
            messages: importCandidates.slice(offset, offset + 20),
          }),
        });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw Error("team import failed");
        processed += Number(result.processed || 0);
      }
      setStatus(`共有受信箱への登録処理が完了しました（処理件数：${processed}）。受信箱で確認してください`);
      setTeamStorageConsent(false);
    } catch {
      setStatus("共有受信箱への登録に失敗しました。再試行前に受信箱の重複有無を確認してください");
    } finally {
      setWorking(false);
    }
  }

  async function sendReply() {
    if (!unlocked || !sessionRef.current || !conversationId || working || !reply.trim()) return;
    setWorking(true);
    setStatus("返信を暗号化してX Chatに送信しています");
    try {
      if (!window.confirm("選択したX Chat会話へ実際に返信を送信します。送信しますか？")) return;
      const payload = sessionRef.current.prepareEncryptedReply(conversationId, reply);
      const response = await fetch("/api/omnibox/x/sync", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "chat_send", connection_id: connectionId, conversation_id: conversationId, payload }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.message_sent !== true) throw Error("送信エラー");
      setReply("");
      setStatus("X Chatに返信を送信しました。X本体で到達を確認してください");
    } catch {
      setStatus("返信は完了していません。再送信前にX本体の送信履歴を確認してください");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-5 text-slate-900">
      <h1 className="text-2xl font-semibold">X Chat 送受信テスト</h1>
      <p className="text-sm text-slate-600">MatoMeet内での受信と返信を検証する専用画面です。PINは端末内の公式SDKだけで使用し、サーバーには送信しません。既存の鍵は変更しません。</p>
      <p role="status" className="rounded-lg bg-rose-50 p-3 text-sm">{status}</p>
      <label className="block text-sm">X連携アカウント
        <select className="mt-1 block w-full rounded border p-2" value={connectionId} onChange={(e) => { sessionRef.current?.lock(); sessionRef.current = null; setUnlocked(false); setMessages([]); setOwnXUserId(""); setImportCandidates([]); setTeamStorageConsent(false); setPreflightReady(false); setPinAttempted(false); setAvailableConversations([]); setSelectedConversation(""); setConnectionId(e.target.value); }}>
          {connections.map((c) => <option value={c.id} key={c.id}>{c.account_name || "Xアカウント"}</option>)}
        </select>
      </label>
      {!unlocked && <section className="rounded-lg border p-4 space-y-3">
        <button disabled={working || !connectionId || pinAttempted} onClick={preflight} className="rounded border px-4 py-2 disabled:opacity-50">PINなしで復元準備を確認</button>
        {preflightReady && !pinAttempted && <>
          <label className="block text-sm">既存のX Chat PIN（サーバーへ送信されません）
            <input ref={pinRef} type="password" autoComplete="off" className="mt-1 block w-full rounded border p-2" />
          </label>
          <button disabled={working || !connectionId} onClick={unlock} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">既存鍵を1回だけ復元</button>
        </>}
        {pinAttempted && !unlocked && <p className="text-sm text-amber-800">安全のため、この画面でのPIN再試行を停止しています。連続入力しないでください。</p>}
      </section>}
      {unlocked && <section className="space-y-3">
        <button disabled={working} onClick={refreshConversations} className="rounded border px-4 py-2 disabled:opacity-50">会話一覧を取得</button>
        {!!availableConversations.length && <label className="block text-sm">本文を確認する会話
          <select className="mt-1 block w-full rounded border p-2" value={selectedConversation} onChange={(e) => { setSelectedConversation(e.target.value); setConversationId(""); setMessages([]); setImportCandidates([]); setTeamStorageConsent(false); }}>
            {availableConversations.map((c) => <option value={c.id} key={c.id}>{c.label}</option>)}
          </select>
        </label>}
        <button disabled={working || !selectedConversation} onClick={loadConversation} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">選択した会話の本文を取得</button>
        <div className="space-y-2">{messages.map((m) => <div className="rounded border p-3 text-sm whitespace-pre-wrap" key={m.conversationId + m.messageId}>{m.text}</div>)}</div>
        {!!messages.length && <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">MatoMeetの共通受信箱へ登録</h2>
          <p className="text-sm text-slate-600">ここで同意すると、復号した本文が組織の共有データベースに保存され、従業員からも閲覧できます。X Chatの端末内だけの暗号化保護とは異なる保存になります。</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={teamStorageConsent} onChange={(e) => setTeamStorageConsent(e.target.checked)} />
            復号したX Chat本文をMatoMeetのチーム受信箱へ保存することに同意します
          </label>
          <button disabled={working || !teamStorageConsent || !importCandidates.length} onClick={shareWithTeamInbox}
            className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">確認済み本文を受信箱へ登録（{importCandidates.length}件）</button>
          {importCandidates.length === 0 && <p className="text-xs text-amber-700">元イベントの日時が確認できないため、安全に登録できる本文がありません。</p>}
        </section>}
        {!!conversationId && <div className="space-y-2">
          <textarea className="w-full rounded border p-3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="X Chatへの返信本文" />
          <button disabled={working || !reply.trim()} onClick={sendReply} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">X Chatに返信する</button>
        </div>}
        <button onClick={() => { sessionRef.current?.lock(); sessionRef.current = null; setUnlocked(false); setMessages([]); setConversationId(""); setStatus("暗号鍵をロックしました"); }} className="rounded border px-4 py-2">暗号鍵をロック</button>
      </section>}
    </main>
  );
}
