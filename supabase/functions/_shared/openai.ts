type ChatToolSchema = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAiInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" }
  | { type: "input_file"; filename: string; file_data: string };

type OpenAiFunctionCall = {
  type?: string;
  name?: string;
  arguments?: string;
};

export type OpenAiExtractionRequest = {
  systemPrompt: string;
  userContent: OpenAiInputContent[];
  toolSchema: ChatToolSchema;
};

export async function extractWithOpenAi<T>({
  systemPrompt,
  userContent,
  toolSchema,
}: OpenAiExtractionRequest): Promise<T> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const primaryModel = Deno.env.get("OPENAI_EXTRACTION_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5.6-terra";
  const fallbackModel = Deno.env.get("OPENAI_EXTRACTION_FALLBACK_MODEL") || "gpt-5";
  const models = primaryModel === fallbackModel ? [primaryModel] : [primaryModel, fallbackModel];

  let lastError = "";
  for (const model of models) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: [
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [
          {
            type: "function",
            name: toolSchema.function.name,
            description: toolSchema.function.description,
            parameters: toolSchema.function.parameters,
            strict: false,
          },
        ],
        tool_choice: {
          type: "function",
          name: toolSchema.function.name,
        },
        reasoning: { effort: "low" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `OpenAI error (${model}, ${response.status}): ${errorText}`;
      console.error(lastError);
      if (response.status === 429 || response.status === 402 || response.status >= 500 || response.status === 404) {
        continue;
      }
      throw new Error(`OpenAI-verwerking mislukt (${response.status}).`);
    }

    const data = await response.json();
    const outputItems = Array.isArray(data.output) ? data.output as OpenAiFunctionCall[] : [];
    const functionCall = outputItems.find((item) => item.type === "function_call" && item.name === toolSchema.function.name);
    const argumentsJson = functionCall?.arguments;

    if (!argumentsJson || typeof argumentsJson !== "string") {
      console.error("OpenAI response without function call:", JSON.stringify(data).slice(0, 4000));
      throw new Error("OpenAI gaf geen gestructureerde extractie terug.");
    }

    try {
      return JSON.parse(argumentsJson) as T;
    } catch (_error) {
      console.error("OpenAI function arguments could not be parsed:", argumentsJson);
      throw new Error("OpenAI-antwoord kon niet gelezen worden.");
    }
  }

  throw new Error(lastError || "OpenAI-verwerking mislukt.");
}

export function openAiImageContent(mimeType: string, base64: string): OpenAiInputContent {
  return {
    type: "input_image",
    image_url: `data:${mimeType};base64,${base64}`,
    detail: "high",
  };
}

export function openAiPdfContent(filename: string, mimeType: string, base64: string): OpenAiInputContent {
  return {
    type: "input_file",
    filename,
    file_data: `data:${mimeType};base64,${base64}`,
  };
}
