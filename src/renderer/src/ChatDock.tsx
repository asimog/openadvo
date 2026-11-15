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
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { ArrowLeftIcon, ChatBubbleLeftRightIcon, PlusCircleIcon, MicrophoneIcon, PaperClipIcon, StopIcon, QueueListIcon, ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { JobsPanel, ReportCardView, SidePanel } from "./Harness.tsx";
import type { ChatComposerTrigger } from "@astryxdesign/core/Chat";
import { CHAT_MESSAGE_EVENT, CONTEXT_EVENT, COST_EVENT, EXTENSION_QUESTIONS_EVENT, EXTENSION_STATUS_EVENT, HELPERS_EVENT, PLAN_EVENT } from "../../shared/api.ts";
import { ContextPanel, HelperActivity, HelperRecap, ToolCallGroup, UsageRing, chatBlocks, formatTokens } from "./ChatActivity.tsx";
import { PlanPanel, StatusLine } from "./PlanCard.tsx";
import { AgentChangesCard } from "./AgentChangesCard.tsx";
import { ExtensionQuestionCard } from "./ExtensionQuestionCard.tsx";
import { Markdown } from "./Markdown.tsx";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import type { AgentChanges, ChatEvent, ChatMessage as ChatRecord, ContextMeter, CostSummary, EffortLevel, HelperView, EffortState, ExtensionQuestion, ModelChoice, Plan, RunSummary, Workflow } from "../../shared/api.ts";

const api = window.openadvo;

/** Save text as a file from the window (the bridge has no write access by design). */
function saveTextFile(name: string, text: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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
    const read = () => {
      void api.listModels().then(setModels, (e: Error) => setError(e.message));
      void api.getModel().then(setCurrent);
      void api.getEffort().then(setEffort, () => undefined);
    };
    read();
    // H-3: the advocate signs in with Pi outside the window; read the models again on return.
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
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

export function Message(props: { message: ChatRecord; matterId?: string }) {
  const m = props.message;
  // N2: a skill run's report card.
  if (m.skillRun && props.matterId) return <ReportCardView matterId={props.matterId} card={m.skillRun} />;
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
          <div className="chat-text" data-role="agent"><Markdown text={m.text} /></div>
        </ChatMessageBubble>
      </ChatMessage>
    );
  }
  // A Pi extension's screen arrives as a fenced text block (pi-extensions.ts, custom).
  if (m.text.startsWith("```")) {
    return (
      <ChatSystemMessage>
        <div className="chat-text" data-role={m.role}><Markdown text={m.text} /></div>
      </ChatSystemMessage>
    );
  }
  // A multi-line notice (for example a Pi extension's report) keeps its lines.
  if (m.text.includes(String.fromCharCode(10))) {
    return (
      <ChatSystemMessage>
        <pre className="ext-pre" data-role={m.role}>{m.text.trim()}</pre>
      </ChatSystemMessage>
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
  // Decision 21: status lines that Pi extensions set, by key.
  const [extStatus, setExtStatus] = useState<Record<string, string[]>>({});
  // H-12: questions from Pi extensions that wait for the advocate.
  const [questions, setQuestions] = useState<ExtensionQuestion[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [meter, setMeter] = useState<ContextMeter | null>(null);
  const [helpers, setHelpers] = useState<HelperView[]>([]);
  const [lastRun, setLastRun] = useState<RunSummary | undefined>();
  const [cost, setCost] = useState<CostSummary | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [view, setView] = useState<"chat" | "context" | "jobs">("chat");
  // O9: the side panel, opened with a first question ("Side question" or /btw).
  const [side, setSide] = useState<{ id: number; text: string } | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [jobsVersion, setJobsVersion] = useState(0);
  // N3: "/" lists the skills and the typed commands; "@" adds a record of this matter.
  const [skills, setSkills] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    void api.listSkills().then(
      (r) => setSkills(r.skills.filter((x) => !x.error && !x.shadowed).map((x) => ({ id: x.id, label: `${x.id} ${x.title}` }))),
      () => setSkills([]),
    );
  }, []);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  useEffect(() => {
    void api.listWorkflows().then(setWorkflows, () => setWorkflows([]));
  }, []);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setChanges([]);
    setQuestions([]);
    setPlan(null);
    setMeter(null);
    setHelpers([]);
    setLastRun(undefined);
    setCost(undefined);
    setSessionId(undefined);
    setView("chat");
    setSide(null);
    setSideOpen(false);
    void loadChanges();
    let live = true;
    // H-3 and the Context tab: read the state again after a run or a return to the window.
    const refresh = () => {
      void api.getChat(props.matterId).then((s) => {
        if (!live) return;
        setModel(s.model);
        setMeter(s.context ?? null);
        setHelpers(s.helpers ?? []);
        setLastRun(s.lastRun);
        setCost(s.cost);
        setSessionId(s.sessionId);
      }, () => undefined);
    };
    window.addEventListener("focus", refresh);
    api.getChat(props.matterId).then(
      (s) => {
        if (!live) return;
        setMessages(s.messages);
        setBusy(s.busy);
        setModel(s.model);
        setExtStatus(s.status ?? {});
        setQuestions(s.questions ?? []);
        setPlan(s.plan ?? null);
        setMeter(s.context ?? null);
        setHelpers(s.helpers ?? []);
        setLastRun(s.lastRun);
        setCost(s.cost);
        setSessionId(s.sessionId);
      },
      (e: Error) => live && setError(`The agent could not start: ${e.message}`),
    );
    // The stream is AG-UI protocol events (engineering.md EC-11).
    const off = api.onChatEvent((ev: ChatEvent) => {
      if (ev.matterId !== props.matterId) return;
      const e = ev.event as unknown as { type: string } & Record<string, unknown>;
      // A message arrives once and then changes in place (a tool call becomes complete).
      const upsert = (message: ChatRecord) => setMessages((m) => (m.some((x) => x.id === message.id) ? m.map((x) => (x.id === message.id ? message : x)) : [...m, message]));
      const add = (message: ChatRecord) => setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]));
      if (e.type === "RUN_STARTED") setBusy(true);
      else if (e.type === "RUN_FINISHED") {
        setBusy(false);
        setJobsVersion((v) => v + 1);
        refresh();
        // An AG-UI interrupt: the agent proposed changes the advocate must keep or undo.
        const outcome = e.outcome as { type?: string } | undefined;
        if (outcome?.type === "interrupt") {
          void loadChanges();
          void onRevisionsChanged.current();
        }
      }
      else if (e.type === "RUN_ERROR") {
        setBusy(false);
        refresh();
        add({ id: `error-${String(e.timestamp)}`, role: "notice", text: String(e.message) });
      } else if (e.type === "TEXT_MESSAGE_START") add({ id: String(e.messageId), role: "agent", text: "" });
      else if (e.type === "TEXT_MESSAGE_CONTENT") setMessages((m) => m.map((x) => (x.id === e.messageId ? { ...x, text: x.text + String(e.delta) } : x)));
      else if (e.type === "CUSTOM" && e.name === CHAT_MESSAGE_EVENT) upsert(e.value as ChatRecord);
      else if (e.type === "CUSTOM" && e.name === EXTENSION_STATUS_EVENT) setExtStatus((e.value as Record<string, string[]>) ?? {});
      else if (e.type === "CUSTOM" && e.name === EXTENSION_QUESTIONS_EVENT) setQuestions((e.value as ExtensionQuestion[]) ?? []);
      else if (e.type === "CUSTOM" && e.name === PLAN_EVENT) setPlan((e.value as Plan | null) ?? null);
      else if (e.type === "CUSTOM" && e.name === CONTEXT_EVENT) setMeter(e.value as ContextMeter);
      else if (e.type === "CUSTOM" && e.name === HELPERS_EVENT) setHelpers((e.value as HelperView[]) ?? []);
      else if (e.type === "CUSTOM" && e.name === COST_EVENT) {
        const value = e.value as { lastRun?: RunSummary; cost?: CostSummary };
        setLastRun(value.lastRun);
        setCost(value.cost);
      }
    });
    return () => {
      live = false;
      off();
      window.removeEventListener("focus", refresh);
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
    // O9: "/btw <question>" opens the side panel; it never goes to the main conversation.
    const btw = /^\/btw\b\s*([\s\S]*)$/i.exec(text.trim());
    if (btw) {
      setSideOpen(true);
      if (btw[1].trim()) setSide((s) => ({ id: (s?.id ?? 0) + 1, text: btw[1].trim() }));
      return;
    }
    void api.sendChat(props.matterId, text);
  };
  const triggers: ChatComposerTrigger[] = [
    {
      character: "/",
      searchSource: (() => {
        const all = () => [...skills, { id: "btw", label: "btw Side question (read only)" }, { id: "context", label: "context What the agent receives" }, { id: "cost", label: "cost Tokens and cost" }];
        return { search: (q: string) => all().filter((x) => x.label.toLowerCase().includes(q.toLowerCase())), bootstrap: () => all() };
      })(),
      onSelect: (item) => `/${item.id} `,
      emptySearchText: "No skill or command matches.",
    },
    {
      character: "@",
      searchSource: (() => {
        const find = async (q: string) => (await api.contextCandidates(props.matterId, q)).map((c) => ({ id: `${c.kind}:${c.id}`, label: `${c.kind}: ${c.label}` }));
        return { search: find, bootstrap: () => find("") };
      })(),
      onSelect: (item) => `@[${item.id} ${item.label.replace(/^[a-z]+: /, "").replace(/[\[\]]/g, "").slice(0, 60)}] `,
      emptySearchText: "No record of this matter matches.",
    },
  ];

  return (
    <div className="dock" aria-label="Chat" data-testid="chat-dock">
      <div className="dock-header">
        <div className="dock-title">
          <Heading level={2}>{props.title}</Heading>
          <Button
            label="New conversation"
            size="sm"
            variant="ghost"
            isIconOnly
            icon={<Icon icon={PlusCircleIcon} size="sm" />}
            isDisabled={busy}
            clickAction={async () => {
              const s = await api.newConversation(props.matterId);
              setMessages(s.messages);
              setModel(s.model);
              setPlan(s.plan ?? null);
              setMeter(s.context ?? null);
              setHelpers(s.helpers ?? []);
              setLastRun(s.lastRun);
              setCost(s.cost);
              setSessionId(s.sessionId);
              setView("chat");
            }}
          />
          <Button
            label="Export cost CSV"
            size="sm"
            variant="ghost"
            clickAction={async () => saveTextFile(`Open Advocate cost ${props.title.replace(/[\\/:*?"<>|]+/g, " ").trim()}.csv`, await api.costCsv(props.matterId))}
          />
          {busy || helpers.some((h) => h.state === "running") ? (
            <span className="dock-busy">
              {busy ? <Spinner size="sm" /> : null}
              {busy ? <Text type="supporting">Working…</Text> : <Text type="supporting">{helpers.filter((h) => h.state === "running").length} helper{helpers.filter((h) => h.state === "running").length === 1 ? "" : "s"} running</Text>}
              <Button label="Stop" size="sm" variant="ghost" data-testid="stop-chat" clickAction={async () => { await api.stopChat(props.matterId); }} />
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
        <TabList value={view} onChange={(v) => setView(v as "chat" | "context" | "jobs")} size="sm" hasDivider>
          <Tab value="chat" label="Chat" data-testid="chat-tab" icon={<Icon icon={ChatBubbleLeftRightIcon} size="sm" />} />
          <Tab
            value="context"
            label="Context"
            data-testid="context-tab"
            icon={<UsageRing percent={meter?.percent ?? null} />}
            endContent={<Text type="supporting">{formatTokens(meter?.tokens ?? lastRun?.total ?? null)}</Text>}
          />
          <Tab value="jobs" label="Jobs" data-testid="jobs-tab" icon={<Icon icon={QueueListIcon} size="sm" />} />
        </TabList>
        {view === "chat" ? <StatusLine conversationId={props.matterId} plan={plan} helpers={helpers} busy={busy} /> : null}
        {view === "chat" && plan ? <PlanPanel conversationId={props.matterId} plan={plan} /> : null}
        <div className="dock-slot" ref={props.slotRef} />
      </div>
      {view === "jobs" ? (
        <JobsPanel matterId={props.matterId} version={jobsVersion} />
      ) : view === "context" ? (
        <ContextPanel
          conversationId={props.matterId}
          title={props.title}
          busy={busy}
          sessionId={sessionId}
          model={model}
          messages={messages.length}
          meter={meter}
          lastRun={lastRun}
          cost={cost}
          helpers={helpers}
          onCompact={async () => setMeter(await api.compactChat(props.matterId))}
        />
      ) : (
      <div className="dock-chat" data-testid="chat-log">
        {error ? <div className="notice dock-notice">{error}</div> : null}
        {sideOpen ? (
          <SidePanel
            matterId={props.matterId}
            view={props.openItem ?? "the matter's tabs"}
            first={side}
            onBring={(t) => {
              inputRef.current?.focus();
              inputRef.current?.insertText(t);
            }}
            onClose={() => {
              setSideOpen(false);
              setSide(null);
            }}
          />
        ) : null}
        {Object.keys(extStatus).length > 0 ? (
          <div className="dock-ext-status mono" data-testid="extension-status" aria-label="Extension status">
            {Object.entries(extStatus).map(([key, lines]) => (
              <div key={key} title={key}>{lines.join(" · ")}</div>
            ))}
          </div>
        ) : null}
        <ChatLayout
          density="compact"
          emptyState={
            <EmptyState
              isCompact
              icon={<Icon icon={ChatBubbleLeftRightIcon} size="lg" color="secondary" />}
              title="Instruct the agent"
              description="The agent reads the sources, the Notebook and the drafts, proposes, and checks. It cannot confirm a fact, approve a draft or file. You decide every legal point. Start with a workflow:"
              actions={
                <div className="empty-workflows">
                  {workflows.filter((w) => w.builtIn).slice(0, 4).map((w) => (
                    <Button key={w.id} label={w.title} size="sm" variant="ghost" isDisabled={busy} clickAction={() => send(w.body)} />
                  ))}
                </div>
              }
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
                  triggers={triggers}
                  label="Message to the agent"
                  placeholder="For example: list the sources"
                  onFiles={(files) => void props.onAddPaths(api.pathsForFiles(files))}
                />
              }
              footerActions={
                <div className="composer-tools">
                  <Button
                    label="Attach files to this matter"
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
                  <Button
                    label="Side question"
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    data-testid="side-question"
                    icon={<Icon icon={ChatBubbleOvalLeftEllipsisIcon} size="sm" />}
                    onClick={() => setSideOpen(true)}
                  />
                  <DropdownMenu
                    button={{ label: "Workflows", variant: "ghost", size: "sm", children: "Workflows", isDisabled: busy }}
                    menuWidth={300}
                    items={workflows.map((w) => ({ label: w.title, onClick: () => send(w.body) }))}
                  />
                  <ModelPicker isDisabled={busy} key={model ?? "none"} />
                </div>
              }
              sendButton={<ChatSendButton isDisabled={busy} />}
            />
          }
        >
          {messages.length > 0 || changes.length > 0 || questions.length > 0 ? (
            <>
          {messages.length > 0 ? (
            <ChatMessageList density="compact" isStreaming={busy}>
              {chatBlocks(messages).map((block) => {
                if (block.kind === "tools") return <ToolCallGroup key={block.key} calls={block.calls} />;
                if (block.kind === "helper") {
                  return (
                    <HelperActivity
                      key={block.key}
                      conversationId={props.matterId}
                      events={block.events}
                      tools={block.tools}
                      live={helpers.find((h) => h.id === block.id)}
                    />
                  );
                }
                if (block.message.helper?.event === "recap") return <HelperRecap key={block.message.id} message={block.message} />;
                return <Message key={block.message.id} message={block.message} matterId={props.matterId} />;
              })}
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
          {questions.map((q) => (
            <ExtensionQuestionCard key={q.id} matterId={props.matterId} question={q} />
          ))}
            </>
          ) : null}
        </ChatLayout>
      </div>
      )}
    </div>
  );
}
