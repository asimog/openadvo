import { useRef, useState, type CSSProperties } from "react";
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, type ChatComposerInputHandle } from "@astryxdesign/core/Chat";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, Layout, LayoutContent, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import { Token } from "@astryxdesign/core/Token";
import { BookOpenIcon, DocumentTextIcon, FolderIcon, PaperClipIcon, PencilSquareIcon, ScaleIcon } from "@heroicons/react/24/outline";
import { ModelPicker } from "./ChatDock.tsx";
import type { MatterSummary, Workflow } from "../../shared/api.ts";
import { useEffect, type ReactNode } from "react";

const api = window.openadvo;

// Fill the content area so the heading and composer stay vertically centred.
const pageStyle: CSSProperties = { minHeight: "100%" };
const composerInput: CSSProperties = { minHeight: 84 };
const categoriesStyle: CSSProperties = { paddingInline: "var(--spacing-3)" };

/** What the instruction and the attached files of the landing page carry into a matter. */
export interface Carry {
  text: string;
  paths: string[];
}

// Each prompt asks for something an agent tool serves today (build-plan steps 1 to 4).
const CATEGORIES = [
  { key: "sources", label: "Sources", icon: DocumentTextIcon },
  { key: "notebook", label: "Notebook", icon: BookOpenIcon },
  { key: "drafts", label: "Drafts", icon: PencilSquareIcon },
  { key: "workflows", label: "Workflows", icon: ScaleIcon },
] as const;

const SUGGESTIONS: Record<string, Array<{ heading: string; body: string; prompt: string }>> = {
  sources: [
    { heading: "List the sources", body: "Every file of the matter with its hash and status", prompt: "List the sources" },
    { heading: "Search the sources", body: "Find a word or phrase and the page and line of each hit", prompt: "Search the sources for " },
    { heading: "Read pages of a source", body: "The stored text of a page range, line by line", prompt: "Read pages 1 to 3 of " },
  ],
  notebook: [
    { heading: "Show the chronology", body: "The dated events of the matter in order, with source lines", prompt: "Show the chronology" },
    { heading: "List events not yet confirmed", body: "Candidate events that wait for your decision", prompt: "List the events that are not confirmed" },
    { heading: "List the procedural history", body: "Institution, applications, orders, hearings and judgments", prompt: "List the procedural events" },
  ],
  drafts: [
    { heading: "Read the List of Dates", body: "The live text of the latest revision", prompt: "Read the List of Dates draft" },
    { heading: "Trace a paragraph to its source", body: "From a draft paragraph to the event and the source line", prompt: "Show the source of the paragraph that says " },
  ],
};

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * The chat landing page: where every session starts. An instruction opens a matter;
 * the chat then docks on the left of that matter.
 */
export function Landing(props: {
  matters: MatterSummary[];
  /** Open an existing matter and carry the typed instruction and attached files into it. */
  onOpenMatter: (matterId: string, carry: Carry) => void;
  /** Ask for a new matter. The carry is applied after the advocate creates it. */
  onNewMatter: (carry: Carry) => void;
  /** V1-10: the archived matters. */
  footer?: ReactNode;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [draft, setDraft] = useState({ title: "", body: "" });
  useEffect(() => {
    void api.listWorkflows().then(setWorkflows, () => setWorkflows([]));
  }, []);
  const [paths, setPaths] = useState<string[]>([]);
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const suggestions =
    category === "workflows"
      ? workflows.map((w) => ({ heading: w.title, body: w.builtIn ? "Built in" : "Your workflow", prompt: w.body }))
      : category
        ? SUGGESTIONS[category]
        : null;

  const carry = (text: string): Carry => ({ text, paths });
  const typed = () => inputRef.current?.getValue() ?? "";
  const addPaths = (more: string[]) => setPaths((prev) => [...prev, ...more.filter((p) => !prev.includes(p))]);

  const applySuggestion = (prompt: string) => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (document.activeElement) window.getSelection()?.selectAllChildren(document.activeElement);
    input.insertText(prompt);
  };

  return (
    <Layout
      height="fill"
      contentWidth={720}
      padding={6}
      content={
        <LayoutContent>
          <VStack gap={8} vAlign="center" style={pageStyle}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Icon icon={ScaleIcon} size="md" color="accent" />
                <Text type="large" as="h2">
                  Open Advocate
                </Text>
              </HStack>
              <Text type="display-2" as="h1">
                What is the instruction?
              </Text>
            </VStack>

            <ChatComposer
              onSubmit={(value) => props.onNewMatter(carry(value))}
              placeholder="Instruct the agent. Send to start a new matter."
              input={
                <ChatComposerInput
                  handleRef={inputRef}
                  label="Instruction to the agent"
                  placeholder="Instruct the agent. Send to start a new matter."
                  style={composerInput}
                  onFiles={(files) => addPaths(api.pathsForFiles(files))}
                />
              }
              drawer={
                paths.length > 0 ? (
                  <ChatComposerDrawer count={paths.length}>
                    {paths.map((p) => (
                      <Token key={p} label={baseName(p)} onRemove={() => setPaths((prev) => prev.filter((x) => x !== p))} />
                    ))}
                  </ChatComposerDrawer>
                ) : undefined
              }
              headerActions={
                <DropdownMenu
                  button={{
                    label: "Choose matter",
                    variant: "ghost",
                    size: "sm",
                    icon: <Icon icon={FolderIcon} size="sm" />,
                    children: "Choose matter",
                  }}
                  menuWidth={280}
                  items={[
                    ...props.matters.map((m) => ({
                      label: m.title,
                      icon: FolderIcon,
                      onClick: () => props.onOpenMatter(m.id, carry(typed())),
                    })),
                    ...(props.matters.length > 0 ? [{ type: "divider" as const }] : []),
                    { label: "New matter…", onClick: () => props.onNewMatter(carry(typed())) },
                  ]}
                />
              }
              footerActions={
                <>
                  <Button
                    label="Attach PDF files"
                    size="md"
                    variant="ghost"
                    icon={<Icon icon={PaperClipIcon} size="sm" />}
                    clickAction={async () => addPaths(await api.pickFiles())}
                  />
                  <ModelPicker isDisabled={false} />
                </>
              }
            />

            <VStack gap={6} style={categoriesStyle}>
              <ToggleButtonGroup label="What the agent can do today" value={category} onChange={setCategory} size="lg">
                {CATEGORIES.map((cat) => (
                  <ToggleButton key={cat.key} value={cat.key} label={cat.label} icon={<Icon icon={cat.icon} size="sm" />} />
                ))}
              </ToggleButtonGroup>
              {suggestions ? (
                <Grid columns={{ minWidth: 280 }} gap={3}>
                  {suggestions.map((s) => (
                    <ClickableCard key={s.heading} label={s.heading} variant="muted" padding={3} onClick={() => applySuggestion(s.prompt)}>
                      <VStack gap={0.5}>
                        <Heading level={4}>{s.heading}</Heading>
                        <Text type="body" color="secondary" size="xsm">
                          {s.body}
                        </Text>
                      </VStack>
                    </ClickableCard>
                  ))}
                </Grid>
              ) : null}
              {category === "workflows" ? (
                <VStack gap={2}>
                  <Heading level={4}>Your workflows</Heading>
                  {workflows.filter((w) => !w.builtIn).map((w) => (
                    <HStack key={w.id} gap={2} vAlign="center">
                      <Text>{w.title}</Text>
                      <Button label="Delete" size="sm" variant="ghost" clickAction={async () => setWorkflows(await api.deleteWorkflow(w.id))} />
                    </HStack>
                  ))}
                  <input aria-label="Workflow title" data-testid="workflow-title" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  <textarea aria-label="Workflow instruction" data-testid="workflow-body" placeholder="The instruction to the agent" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                  <Button
                    label="Add workflow"
                    size="sm"
                    isDisabled={!draft.title.trim() || !draft.body.trim()}
                    clickAction={async () => {
                      setWorkflows(await api.saveWorkflow(draft));
                      setDraft({ title: "", body: "" });
                    }}
                  />
                </VStack>
              ) : null}
            </VStack>
            {props.footer}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
