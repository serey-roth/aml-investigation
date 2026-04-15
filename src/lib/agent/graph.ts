import { createAgent } from "langchain";
import { CaseDataLoader } from "./loaders";
import { investigatorModel } from "./models";
import { INVESTIGATOR_PROMPT } from "./prompts";
import { createTools } from "./tools";

export async function runInvestigation(alertDescription: string, loader: CaseDataLoader) {
  const agent = createAgent({
    model: investigatorModel,
    systemPrompt: INVESTIGATOR_PROMPT,
    tools: createTools(loader),
  });

  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: `Alert:\n\n${alertDescription}`,
      },
    ],
  });

  const finalMessage = result.messages[result.messages.length - 1];
  return finalMessage.content;
}
