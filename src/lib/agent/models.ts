import { ChatOllama } from "@langchain/ollama";

export const investigatorModel = new ChatOllama({
  model: "qwen2.5:3b",
  temperature: 0,
});
