/**
 * The placeholder extension (docs/specs/native-harness-parts.md section 6). It tests the
 * extension system: loading, a command, a notice and one question. It registers no tool, so
 * the model never sees it and it adds nothing to any context. It reads and writes nothing.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function placeholder(pi: ExtensionAPI): void {
  pi.registerCommand("placeholder", {
    description: "Test the extension system. /placeholder shows a notice; /placeholder ask asks one yes-or-no question.",
    handler: async (args, ctx) => {
      if (args.trim() === "ask") {
        const yes = await ctx.ui.confirm("Placeholder question", "Does the extension system work?");
        ctx.ui.notify(yes ? "Placeholder: you answered yes." : "Placeholder: you answered no, or dismissed the question.", "info");
        return;
      }
      ctx.ui.notify("The placeholder extension works. It adds no tool and reads nothing.", "info");
    },
  });
}
