"use client";

import { useActionState, useEffect, useRef } from "react";

import { sendReply, type ReplyState } from "./actions";
import styles from "./page.module.css";

const initialState: ReplyState = {
  status: "idle",
  message: "",
};

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const [state, formAction, isPending] = useActionState(sendReply, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className={styles.replyForm}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="reply-message" className={styles.replyLabel}>
        返信
      </label>
      <textarea
        id="reply-message"
        name="message"
        maxLength={5000}
        required
        rows={4}
        placeholder="LINEへ送るメッセージを入力"
        className={styles.replyTextarea}
      />
      <div className={styles.replyFooter}>
        <p
          className={
            state.status === "error" ? styles.errorText : styles.statusText
          }
          aria-live="polite"
        >
          {state.message}
        </p>
        <button type="submit" disabled={isPending} className={styles.replyButton}>
          {isPending ? "送信中..." : "LINEへ返信"}
        </button>
      </div>
    </form>
  );
}
