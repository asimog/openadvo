import { useEffect, useRef, useState } from "react";
import { ChatComposer, ChatComposerInput, ChatMessageList, ChatSendButton, type ChatComposerInputHandle } from "@astryxdesign/core/Chat";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { BuildingLibraryIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { CHAT_MESSAGE_EVENT, EXTENSION_QUESTIONS_EVENT, FIRM_AGENT_ID, FIRM_HANDOFFS_EVENT, PLAN_EVENT } from "../../shared/api.ts";
import { PlanPanel, StatusLine } from "./PlanCard.tsx";
import type { ChatEvent, ChatMessage as ChatRecord, ExtensionQuestion, FirmHandoff, Plan } from "../../shared/api.ts";
import { Message } from "./ChatDock.tsx";
import { ExtensionQuestionCard } from "./ExtensionQuestionCard.tsx";
import type { Carry } from "./Landing.tsx";

const api = window.openadvo;

/**
 * O10: the Firm Agent on Home (docs/specs/agent-framework.md section 2). It reads every open
 * matter's summary and the workflows. An instruction it proposes for a matter waits here; only the
 * advocate takes it to the matter, where it lands in the composer unsent.
 */
export function FirmChat(props: { onOpenMatter: (matterId: string, carry: Carry) => void }) {
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<ExtensionQuestion[]>([]);
  const [handoffs, setHandoffs] = useState<FirmHandoff[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ChatComposerInputHandle>(null);

  useEffect(() => {
    let live = true;
    api.getChat(FIRM_AGENT_ID).then(
      (s) => {
        if (!live) return;
        setMessages(s.messages);
        setBusy(s.busy);
        setQuestions(s.questions ?? []);
        setHandoffs(s.handoffs ?? []);
        setPlan(s.plan ?? null);
      },
      (e: Error) => live && setError(`The Firm Agent could not start: ${e.message}`),
    );
    const off = api.onChatEvent((ev: ChatEvent) => {
      if (ev.matterId !== FIRM_AGENT_ID) return;
      const e = ev.event as unknown as { type: string } & Record<string, unknown>;
      const add = (m: ChatRecord) => setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      if (e.type === "RUN_STARTED") setBusy(true);
      else if (e.type === "RUN_FINISHED") setBusy(false);
      else if (e.type === "RUN_ERROR") {
        setBusy(false);
        add({ id: `error-${String(e.timestamp)}`, role: "notice", text: String(e.message) });
      } else if (e.type === "TEXT_MESSAGE_START") add({ id: String(e.messageId), role: "agent", text: "" });
      else if (e.type === "TEXT_MESSAGE_CONTENT") setMessages((list) => list.map((x) => (x.id === e.messageId ? { ...x, text: x.text + String(e.delta) } : x)));
      else if (e.type === "TOOL_CALL_START") add({ id: String(e.toolCallId), role: "tool", text: `Used tool: ${String(e.toolCallName)}` });
      else if (e.type === "CUSTOM" && e.name === CHAT_MESSAGE_EVENT) add(e.value as ChatRecord);
      else if (e.type === "CUSTOM" && e.name === EXTENSION_QUESTIONS_EVENT) setQuestions((e.value as ExtensionQuestion[]) ?? []);
      else if (e.type === "CUSTOM" && e.name === FIRM_HANDOFFS_EVENT) setHandoffs((e.value as FirmHandoff[]) ?? []);
      else if (e.type === "CUSTOM" && e.name === PLAN_EVENT) setPlan((e.value as Plan | null) ?? null);
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  const send = (text: string) => {
    if (!text.trim()) return;
    void api.sendChat(FIRM_AGENT_ID, text);
  };
  const close = async (id: string) => setHandoffs(await api.closeFirmHandoff(id));

  return (
    <section className="firm-chat" aria-label="Firm Agent" data-testid="firm-chat">
      <div className="firm-head">
        <Icon icon={BuildingLibraryIcon} size="sm" color="accent" />
        <Heading level={3}>Firm Agent</Heading>
        <Button
          label="New firm conversation"
          size="sm"
          variant="ghost"
          isIconOnly
          icon={<Icon icon={PlusCircleIcon} size="sm" />}
          isDisabled={busy}
          clickAction={async () => setMessages((await api.newConversation(FIRM_AGENT_ID)).messages)}
        />
        <span className="dock-busy">
          {busy ? <Spinner size="sm" /> : null}
          {busy ? <Text type="supporting">Working…</Text> : null}
          <Button
            label="Stop"
            size="sm"
            variant="secondary"
            data-testid="stop-firm-chat"
            isDisabled={!busy}
            clickAction={async () => { await api.stopChat(FIRM_AGENT_ID); }}
          />
        </span>
      </div>
      <Text type="supporting" color="secondary">
        Ask about the whole firm: what is pending, which hearings come next, which deadlines are near, which workflow fits. It reads each matter's stage, hearings, deadlines and open items, and your workflows. It does not read a matter's documents. It proposes; you decide. Not yet available to it: the Knowledge Library and advocate memory.
      </Text>
      {error ? <div className="notice">{error}</div> : null}
      <StatusLine conversationId={FIRM_AGENT_ID} plan={plan} helpers={[]} busy={busy} />
      {plan ? <PlanPanel conversationId={FIRM_AGENT_ID} plan={plan} /> : null}
      {messages.length > 0 ? (
        <div className="firm-log" data-testid="firm-log">
          <ChatMessageList density="compact" isStreaming={busy}>
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </ChatMessageList>
        </div>
      ) : null}
      {handoffs.map((h) => (
        <div key={h.id} className="question-card" data-testid="firm-handoff" aria-label={`Proposed instruction for ${h.matterTitle}`}>
          <Text weight="semibold">For {h.matterTitle}</Text>
          <Text>{h.instruction}</Text>
          <Text type="supporting" color="secondary">Why: {h.reason}</Text>
          <div className="question-options">
            <Button
              label="Open in the matter"
              size="sm"
              variant="primary"
              clickAction={async () => {
                await close(h.id);
                props.onOpenMatter(h.matterId, { text: h.instruction, paths: [] });
              }}
            />
            <Button label="Dismiss" size="sm" variant="ghost" clickAction={() => close(h.id)} />
          </div>
        </div>
      ))}
      {questions.map((q) => (
        <ExtensionQuestionCard key={q.id} matterId={FIRM_AGENT_ID} question={q} />
      ))}
      <ChatComposer
        density="compact"
        onSubmit={send}
        placeholder="For example: which hearings are this week, and what is pending in each?"
        input={<ChatComposerInput handleRef={inputRef} label="Message to the Firm Agent" placeholder="For example: which hearings are this week, and what is pending in each?" />}
        sendButton={<ChatSendButton isDisabled={busy} />}
      />
    </section>
  );
}
