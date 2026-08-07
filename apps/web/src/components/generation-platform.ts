import type { GenerationView } from "../types";

export function generationPlatformLabel(platform: GenerationView["platform"]): string {
  if (platform.id === "openai" && platform.source === "legacy_inferred") {
    return "OpenAI (legacy inferred)";
  }
  if (platform.id === "openai") return "OpenAI";
  return "Unknown";
}
