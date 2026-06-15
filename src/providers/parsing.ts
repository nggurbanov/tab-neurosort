export const parseOpenAiText = (body: unknown): string | null => {
  const choices = getRecord(body)?.["choices"];
  if (!Array.isArray(choices)) {
    return null;
  }

  const first = getRecord(choices[0]);
  const messageContent = getRecord(first?.["message"])?.["content"];
  if (typeof messageContent === "string") {
    return messageContent;
  }

  const text = first?.["text"];
  return typeof text === "string" ? text : null;
};

export const parseGeminiText = (body: unknown): string | null => {
  const candidates = getRecord(body)?.["candidates"];
  if (!Array.isArray(candidates)) {
    return null;
  }

  const parts = getRecord(getRecord(candidates[0])?.["content"])?.["parts"];
  if (!Array.isArray(parts)) {
    return null;
  }

  const texts = parts.map((part) => getRecord(part)?.["text"]).filter((text): text is string => typeof text === "string");
  return texts.length > 0 ? texts.join("") : null;
};

export const parseOllamaText = (bodyText: string): string | null => {
  const lines = bodyText.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length > 1) {
    const fragments = lines.map((line) => parseJson(line)).map((value) => getRecord(value)?.["response"]);
    return fragments.every((fragment) => typeof fragment === "string") ? fragments.join("") : null;
  }

  const response = getRecord(parseJson(bodyText))?.["response"];
  return typeof response === "string" ? response : null;
};

export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
};

const getRecord = (value: unknown): Readonly<Record<string, unknown>> | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
};
