import { useEffect, useRef, useState } from "react";
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSendButton,
  ChatSystemMessage,
  type ChatComposerInputHandle,
} from "@astryxdesign/core/Chat";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { ArrowLeftIcon, ChatBubbleLeftRightIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import type { ChatEvent, ChatMessage as ChatRecord, EffortLevel, EffortState, ModelChoice } from "../../shared/api.ts";

const api = window.openadvo;

const EFFORT_LABEL: Record<EffortLevel, string> = {
  off: "No reasoning",
  minimal: "Minimal reasoning",
  low: "Low reasoning",
  medium: "Medium reasoning",
  high: "High reasoning",
  xhigh: "Extra high reasoning",
  max: "Maximum reasoning",
};

/**
 * The model picker and the reasoning effort beside it. Models: pi-ai's list of models that have
 * credentials (Pi's own sign-in). Effort: the levels the chosen model accepts.
 */
export function ModelPicker(props: { isDisabled: boolean }) {
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [effort, setEffort] = useState<EffortState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.listModels().then(setModels, (e: Error) => setError(e.message));
    void api.getModel().then(setCurrent);
    void api.getEffort().then(setEffort, () => undefined);
  }, []);
  const providers = [...new Set(models.map((m) => m.provider))];
  const options = providers.map((p) => ({
    type: "section" as const,
    title: p,
    options: models.filter((m) => m.provider === p).map((m) => ({ value: m.key, label: m.name || m.id, description: m.key })),
  }));
  const fixedEffort = !effort || effort.available.length <= 1;
  return (
    <>
      <Selector
        label="Model"
        isLabelHidden
        size="sm"
        variant="ghost"
        hasSearch
        options={options}
        value={current ?? undefined}
        placeholder={models.length ? "Choose a model" : "No model signed in"}
        emptyText="No model is signed in. Sign in with Pi first."
        isDisabled={props.isDisabled || models.length === 0}
        status={error ? { type: "error", message: error } : undefined}
        onChange={(key) => {
          if (!key) return;
          void api
            .setModel(key)
            .then(setCurrent, (e: Error) => setError(e.message))
            // The accepted levels belong to the model, so read them again.
            .then(() => api.getEffort())
            .then(setEffort, () => undefined);
        }}
      />
      {effort ? (
        <Selector
          label="Reasoning effort"
          isLabelHidden
          size="sm"
          variant="ghost"
          options={effort.available.map((level) => ({ value: level, label: EFFORT_LABEL[level] }))}
          value={effort.level}
          isDisabled={props.isDisabled || fixedEffort}
          onChange={(level) => {
            if (!level) return;
            void api.setEffort(level as EffortLevel).then(setEffort, (e: Error) => setError(e.message));
          }}
        />
      ) : null}
    </>
  );
}

function Message(props: { message: ChatRecord }) {
  const m = props.message;
  if (m.role === "advocate") {
    return (
      <ChatMessage sender="user">
        <ChatMessageBubble>
          <span className="chat-text" data-role="advocate">{m.text}</span>
        </ChatMessageBubble>
      </ChatMessage>
    );
  }
  if (m.role === "agent") {
    return (
      <ChatMessage sender="assistant" name="Agent">
        <ChatMessageBubble variant="ghost" width="100%">
          <div className="chat-text" data-role="agent">{m.text}</div>
        </ChatMessageBubble>
      </ChatMessage>
    );
  }
  return (
    <ChatSystemMessage>
      <span data-role={m.role}>{m.text}</span>
    </ChatSystemMessage>
  );
}

/**
 * The chat with the agent, docked on the left of an open matter. Above the conversation it shows
 * what is open in the view. The view fills `slotRef` with the controls of the open document
 * (the harness bar of a draft, the file facts of a source).
 */
export function ChatDock(props: {
  matterId: string;
  title: string;
  /** The name of the source or draft open in the view, or null for the Notebook. */
  openItem: string | null;
  onBack: () => void;
  slotRef: (element: HTMLElement | null) => void;
  /** Text carried over from the landing page. `id` changes for each new carry. */
  carry: { id: number; text: string } | null;
  onAddPaths: (paths: string[]) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ChatComposerInputHandle>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
    let live = true;
    api.getChat(props.matterId).then(
      (s) => {
        if (!live) return;
        setMessages(s.messages);
        setBusy(s.busy);
        setModel(s.model);
      },
      (e: Error) => live && setError(`The agent could not start: ${e.message}`),
    );
    const off = api.onChatEvent((ev: ChatEvent) => {
      if (ev.matterId !== props.matterId) return;
      if (ev.type === "message") setMessages((m) => [...m, ev.message]);
      else if (ev.type === "delta") setMessages((m) => m.map((x) => (x.id === ev.messageId ? { ...x, text: x.text + ev.delta } : x)));
      else if (ev.type === "busy") setBusy(ev.busy);
    });
    return () => {
      live = false;
      off();
    };
  }, [props.matterId]);

  const carryId = props.carry?.id;
  useEffect(() => {
    if (!props.carry || !props.carry.text) return;
    inputRef.current?.focus();
    inputRef.current?.insertText(props.carry.text);
    // Only a new carry writes into the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carryId]);

  const send = (text: string) => {
    if (!text.trim()) return;
    void api.sendChat(props.matterId, text);
  };

  return (
    <div className="dock" aria-label="Chat" data-testid="chat-dock">
      <div className="dock-header">
        <div className="dock-title">
          <Heading level={2}>{props.title}</Heading>
          {busy ? (
            <span className="dock-busy">
              <Spinner size="sm" />
              <Text type="supporting">Working…</Text>
            </span>
          ) : null}
        </div>
        {props.openItem ? (
          <div className="dock-open">
            <Button label="Back to matter" size="sm" variant="ghost" icon={<Icon icon={ArrowLeftIcon} size="sm" />} onClick={props.onBack} />
            <span className="dock-open-name" title={props.openItem}>
              <Text weight="semibold">{props.openItem}</Text>
            </span>
          </div>
        ) : null}
        <div className="dock-slot" ref={props.slotRef} />
      </div>
      <div className="dock-chat" data-testid="chat-log">
        {error ? <div className="notice dock-notice">{error}</div> : null}
        <ChatLayout
          density="compact"
          emptyState={
            <EmptyState
              isCompact
              icon={<Icon icon={ChatBubbleLeftRightIcon} size="lg" color="secondary" />}
              title="Instruct the agent"
              description="For example: list the sources. The agent reads the matter. You decide every legal point."
            />
          }
          composer={
            <ChatComposer
              density="compact"
              onSubmit={send}
              placeholder="For example: list the sources"
              input={
                <ChatComposerInput
                  handleRef={inputRef}
                  label="Message to the agent"
                  placeholder="For example: list the sources"
                  onFiles={(files) => void props.onAddPaths(api.pathsForFiles(files))}
                />
              }
              footerActions={
                <div className="composer-tools">
                  <Button
                    label="Attach PDF files to this matter"
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    icon={<Icon icon={PaperClipIcon} size="sm" />}
                    clickAction={async () => props.onAddPaths(await api.pickFiles())}
                  />
                  <ModelPicker isDisabled={busy} key={model ?? "none"} />
                </div>
              }
              sendButton={<ChatSendButton isDisabled={busy} />}
            />
          }
        >
          {messages.length > 0 ? (
            <ChatMessageList density="compact" isStreaming={busy}>
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
            </ChatMessageList>
          ) : null}
        </ChatLayout>
      </div>
    </div>
  );
}
