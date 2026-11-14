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
import { ArrowLeftIcon, ChatBubbleLeftRightIcon, MicrophoneIcon, PaperClipIcon, StopIcon } from "@heroicons/react/24/outline";
import { CHAT_MESSAGE_EVENT } from "../../shared/api.ts";
import { AgentChangesCard } from "./AgentChangesCard.tsx";
import type { AgentChanges, ChatEvent, ChatMessage as ChatRecord, EffortLevel, EffortState, ModelChoice } from "../../shared/api.ts";

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
 * Step 10: voice instruction. Records from the microphone, transcribes on this machine, and puts
 * the text into the composer. The advocate reads it and presses Send; voice sends and confirms nothing.
 */
function VoiceButton(props: { onText: (text: string) => void; isDisabled: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const start = async () => {
    setNote(null);
    const status = await api.voiceStatus();
    if (!status.available) return setNote(`Voice is not available: ${status.detail}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();
      rec.current = { recorder, chunks, stream };
      setState("recording");
    } catch (e) {
      setNote(`The microphone could not start: ${(e as Error).message}`);
    }
  };
  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setState("working");
    const done = new Promise<void>((res) => (r.recorder.onstop = () => res()));
    r.recorder.stop();
    await done;
    r.stream.getTracks().forEach((t) => t.stop());
    try {
      const encoded = await new Blob(r.chunks).arrayBuffer();
      const decoded = await new AudioContext().decodeAudioData(encoded);
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start();
      const samples = (await offline.startRendering()).getChannelData(0);
      const text = await api.transcribe(samples);
      if (text) props.onText(text);
      else setNote("No speech was heard.");
    } catch (e) {
      setNote(`Transcription failed: ${(e as Error).message}`);
    } finally {
      setState("idle");
    }
  };
  return (
    <>
      <Button
        label={state === "recording" ? "Stop and transcribe" : "Speak an instruction"}
        size="sm"
        variant="ghost"
        isIconOnly
        isDisabled={props.isDisabled || state === "working"}
        icon={<Icon icon={state === "recording" ? StopIcon : MicrophoneIcon} size="sm" />}
        clickAction={state === "recording" ? stop : start}
      />
      {state === "working" ? <Text type="supporting">Transcribing…</Text> : null}
      {note ? <Text type="supporting" data-testid="voice-note">{note}</Text> : null}
    </>
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
  /** A revision was proposed or decided: the open draft moves to its new head. */
  onRevisionsChanged: () => Promise<void>;
  /** Item f: open a draft and move the editor to one paragraph. */
  onShowChange: (draftId: string, anchor: string) => void;
}) {
  const [changes, setChanges] = useState<AgentChanges[]>([]);
  const loadChanges = () => api.agentChanges(props.matterId).then(setChanges, () => setChanges([]));
  const onRevisionsChanged = useRef(props.onRevisionsChanged);
  onRevisionsChanged.current = props.onRevisionsChanged;
  const [messages, setMessages] = useState<ChatRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ChatComposerInputHandle>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setChanges([]);
    void loadChanges();
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
    // The stream is AG-UI protocol events (decisions.md choice 21).
    const off = api.onChatEvent((ev: ChatEvent) => {
      if (ev.matterId !== props.matterId) return;
      const e = ev.event as unknown as { type: string } & Record<string, unknown>;
      const add = (message: ChatRecord) => setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      if (e.type === "RUN_STARTED") setBusy(true);
      else if (e.type === "RUN_FINISHED") {
        setBusy(false);
        // An AG-UI interrupt: the agent proposed changes the advocate must keep or undo.
        const outcome = e.outcome as { type?: string } | undefined;
        if (outcome?.type === "interrupt") {
          void loadChanges();
          void onRevisionsChanged.current();
        }
      }
      else if (e.type === "RUN_ERROR") {
        setBusy(false);
        add({ id: `error-${String(e.timestamp)}`, role: "notice", text: String(e.message) });
      } else if (e.type === "TEXT_MESSAGE_START") add({ id: String(e.messageId), role: "agent", text: "" });
      else if (e.type === "TEXT_MESSAGE_CONTENT") setMessages((m) => m.map((x) => (x.id === e.messageId ? { ...x, text: x.text + String(e.delta) } : x)));
      else if (e.type === "TOOL_CALL_START") add({ id: String(e.toolCallId), role: "tool", text: `Used tool: ${String(e.toolCallName)}` });
      else if (e.type === "CUSTOM" && e.name === CHAT_MESSAGE_EVENT) add(e.value as ChatRecord);
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
                  <VoiceButton
                    isDisabled={busy}
                    onText={(t) => {
                      inputRef.current?.focus();
                      inputRef.current?.insertText(t);
                    }}
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
          {changes.map((group) => (
            <AgentChangesCard
              key={group.revisionId}
              matterId={props.matterId}
              group={group}
              onShow={props.onShowChange}
              onDecided={async () => {
                await loadChanges();
                await props.onRevisionsChanged();
              }}
            />
          ))}
        </ChatLayout>
      </div>
    </div>
  );
}
