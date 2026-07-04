import type { RegisteredTool } from "../registry";

export const httpFetchTool: RegisteredTool = {
  name: "http_fetch",
  description:
    "Fetch the content of a URL and return its text body. Useful for reading web pages, APIs, or raw files.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch",
      },
      method: {
        type: "string",
        enum: ["GET", "POST"],
        description: "HTTP method (default: GET)",
      },
      body: {
        type: "string",
        description: "Request body for POST requests (JSON string)",
      },
      headers: {
        type: "object",
        description: "Optional HTTP headers as key-value pairs",
      },
    },
    required: ["url"],
  },
  async execute(args) {
    const url = args["url"] as string;
    const method = (args["method"] as string | undefined) ?? "GET";
    const body = args["body"] as string | undefined;
    const headers = (args["headers"] as Record<string, string> | undefined) ?? {};

    const response = await fetch(url, {
      method,
      headers: { "User-Agent": "agent-company/1.0", ...headers },
      ...(method === "POST" && body !== undefined ? { body } : {}),
    });

    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      // Trim very long responses to avoid bloating context
      body: text.length > 8000 ? text.slice(0, 8000) + "\n\n[TRUNCATED]" : text,
    };
  },
};
