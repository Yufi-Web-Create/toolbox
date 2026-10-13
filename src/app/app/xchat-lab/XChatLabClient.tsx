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
  const [conversationId, setConversationId] = useState("");
  const [availableConversations, setAvailableConversations] = useState<{id: string; label: string}[]>([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [messages, setMessages] = useState<XChatVerifiedMessage[]>([]);
  const [reply, setReply] = useState("");
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

  async function unlock() {
    if (working || !connectionId) return;
    const pin = pinRef.current?.value ?? "";
    if (pinRef.current) pinRef.current.value = "";
    if (!pin) { setStatus("PINを入力してください"); return; }
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
      setStatus("既存の暗号鍵を復元しました。会話を取得できます");
    } catch {
      setUnlocked(false);
      setStatus("鍵の復元を確認できませんでした。PINの連続試行は避けてください");
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
        <select className="mt-1 block w-full rounded border p-2" value={connectionId} onChange={(e) => { sessionRef.current?.lock(); sessionRef.current = null; setUnlocked(false); setMessages([]); setConnectionId(e.target.value); }}>
          {connections.map((c) => <option value={c.id} key={c.id}>{c.account_name || "Xアカウント"}</option>)}
        </select>
      </label>
      {!unlocked && <section className="rounded-lg border p-4 space-y-3">
        <label className="block text-sm">既存のX Chat PIN（サーバーへ送信されません）
          <input ref={pinRef} type="password" autoComplete="off" className="mt-1 block w-full rounded border p-2" />
        </label>
        <button disabled={working || !connectionId} onClick={unlock} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">既存鍵を復元</button>
      </section>}
      {unlocked && <section className="space-y-3">
        <button disabled={working} onClick={refreshConversations} className="rounded border px-4 py-2 disabled:opacity-50">会話一覧を取得</button>
        {!!availableConversations.length && <label className="block text-sm">本文を確認する会話
          <select className="mt-1 block w-full rounded border p-2" value={selectedConversation} onChange={(e) => { setSelectedConversation(e.target.value); setConversationId(""); setMessages([]); }}>
            {availableConversations.map((c) => <option value={c.id} key={c.id}>{c.label}</option>)}
          </select>
        </label>}
        <button disabled={working || !selectedConversation} onClick={loadConversation} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">選択した会話の本文を取得</button>
        <div className="space-y-2">{messages.map((m) => <div className="rounded border p-3 text-sm whitespace-pre-wrap" key={m.conversationId + m.messageId}>{m.text}</div>)}</div>
        {!!conversationId && <div className="space-y-2">
          <textarea className="w-full rounded border p-3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="X Chatへの返信本文" />
          <button disabled={working || !reply.trim()} onClick={sendReply} className="rounded bg-rose-700 px-4 py-2 text-white disabled:opacity-50">X Chatに返信する</button>
        </div>}
        <button onClick={() => { sessionRef.current?.lock(); sessionRef.current = null; setUnlocked(false); setMessages([]); setConversationId(""); setStatus("暗号鍵をロックしました"); }} className="rounded border px-4 py-2">暗号鍵をロック</button>
      </section>}
    </main>
  );
}
