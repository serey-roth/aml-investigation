import { ChatOllama } from "@langchain/ollama";

export const investigatorModel = new ChatOllama({
  model: "llama3.2:3b",
  temperature: 0,
});
