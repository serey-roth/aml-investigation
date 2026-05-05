import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";

export const investigatorModel = new ChatOllama({
  model: "qwen2.5:3b",
  temperature: 0,
});

export const embeddingModel = new OllamaEmbeddings({ model: "nomic-embed-text" });