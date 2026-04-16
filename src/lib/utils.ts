export function stripTypologyPrefix(description: string, typology: string): string {
  return description.replace(new RegExp(`^${typology}\\s+`, "i"), "");
}
