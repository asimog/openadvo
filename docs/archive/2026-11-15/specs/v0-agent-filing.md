# v0 spec: agent-operated filing and voice

Step 10 of [../build-plan.md](../build-plan.md). Serves workflow sections 11 and 2 (voice instruction), Appendix A (filing agent-operated, not agent-authorised) and Appendix C 1.

**Input.** The newest filing set (step 8); the portal window (step 9); the advocate's voice.

**Output.** The filing submitted on the portal; `filing.confirmed_1`, `filing.confirmed_2` and `filing.submitted` events bound to the payload hash; the portal receipt as a source with capture method `filing_receipt`.

**Rules.**

1. Two confirmations, both human-only bridge functions, each bound to the payload hash of the newest filing set. The second needs the first. A confirmation that names another payload, or an older set, is refused. Confirmations are append-only.
2. The agent operates the portal window only: read, navigate within the allowed origins, fill text fields (never a password or file field), and click. A click on a submit control is refused.
3. `upload_filing_file` needs confirmation 1. It accepts only a file of the filing set whose bytes still match the manifest's SHA-256.
4. `submit_filing` needs both confirmations. It presses the submit control and records `filing.submitted` with the payload hash.
5. `save_portal_receipt` prints the page shown to PDF and adds it as a source linked to the filing set.
6. Voice: the microphone button records; Whisper tiny English transcribes on this machine (transformers.js 4.3.2, pinned exact; model vendored by `scripts/vendor-voice.ts`); the text goes into the chat composer. Nothing is sent until the advocate presses Send. Voice cannot confirm: no voice path reaches a confirmation.

**Surfaces.** Filing tab: "Confirm the filing set (1 of 2)", "Confirm the filing (2 of 2)". Chat composer: "Speak an instruction". Agent tools: `upload_filing_file`, `submit_filing`, `save_portal_receipt`. Bridge: `confirmFiling`, `voiceStatus`, `transcribe`.

**Not in v0.** An operating-system user-presence prompt on the second confirmation (questions Q-4); a script for the live e-filing portal's forms; continuous voice and spoken commands; languages other than English (decision 10).

**Proof task.** The owner files a real SLP through the application, or runs the flow to the last confirmation on the portal's test path if one exists.
