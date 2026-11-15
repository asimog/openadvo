import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { ExtensionQuestion } from "../../shared/api.ts";

const api = window.openadvo;

/**
 * H-12: one question from a Pi extension, answered in the chat. The extension waits for the
 * answer. "Dismiss" gives it its default answer.
 */
export function ExtensionQuestionCard(props: { matterId: string; question: ExtensionQuestion }) {
  const q = props.question;
  const { kind, detail, options, placeholder, prefill } = q.metadata;
  const [text, setText] = useState(prefill ?? "");
  const [error, setError] = useState<string | null>(null);
  const answer = async (value: string | boolean | null) => {
    setError(null);
    try {
      await api.answerExtensionQuestion(props.matterId, q.id, value);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // The tool policy's approval (native-harness-parts section 2) is the application's own question.
  const approval = q.metadata.asker === "Open Advocate";
  return (
    <section
      className="question-card"
      aria-label={approval ? `Approval: ${q.message}` : `Question from an extension: ${q.message}`}
      data-testid={approval ? "approval-card" : "extension-question"}
      data-kind={kind}
    >
      <Text type="supporting">{approval ? "Approval needed" : "An extension asks"}</Text>
      <Text weight="semibold">{q.message}</Text>
      {detail ? <Text>{detail}</Text> : null}
      {q.expiresAt ? <Text type="supporting">If you do not answer by {new Date(q.expiresAt).toLocaleTimeString()}, it gets the default answer.</Text> : null}
      {kind === "select" ? (
        <div className="question-options">
          {(options ?? []).map((o) => (
            <Button key={o} label={o} size="sm" variant="secondary" clickAction={() => answer(o)} />
          ))}
        </div>
      ) : null}
      {kind === "confirm" ? (
        <div className="question-options">
          <Button label="Yes" size="sm" variant="primary" clickAction={() => answer(true)} />
          <Button label="No" size="sm" variant="secondary" clickAction={() => answer(false)} />
        </div>
      ) : null}
      {kind === "input" ? (
        <TextInput label="Answer" isLabelHidden placeholder={placeholder} value={text} onChange={(v) => setText(v)} onEnter={() => void answer(text)} hasAutoFocus />
      ) : null}
      {kind === "editor" ? <TextArea label="Answer" isLabelHidden rows={6} value={text} onChange={(v) => setText(v)} /> : null}
      <div className="question-options">
        {kind === "input" || kind === "editor" ? <Button label="Send answer" size="sm" variant="primary" clickAction={() => answer(text)} /> : null}
        {approval ? null : <Button label="Dismiss" size="sm" variant="ghost" clickAction={() => answer(null)} />}
      </div>
      {error ? <Text type="supporting" data-testid="question-error">{error}</Text> : null}
    </section>
  );
}
