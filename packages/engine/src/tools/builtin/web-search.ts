import type { RegisteredTool } from "../registry";

/** Uses DuckDuckGo Instant Answer API — no key required. For richer results, swap to a proper search API. */
export const webSearchTool: RegisteredTool = {
  name: "web_search",
  description:
    "Search the web for information and return a summary of top results. Use for current events, facts, and research.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 5)",
      },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = encodeURIComponent(args["query"] as string);
    const maxResults = (args["maxResults"] as number | undefined) ?? 5;

    const res = await fetch(
      `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&no_html=1`,
      { headers: { "User-Agent": "agent-company/1.0" } },
    );

    if (!res.ok) throw new Error(`Search API error: ${res.status}`);

    const data = (await res.json()) as {
      AbstractText?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      Answer?: string;
    };

    const results: Array<{ text: string; url?: string }> = [];

    if (data.Answer) results.push({ text: data.Answer });
    if (data.AbstractText) results.push({ text: data.AbstractText });

    for (const topic of data.RelatedTopics ?? []) {
      if (results.length >= maxResults) break;
      if (topic.Text) {
        const entry: { text: string; url?: string } = { text: topic.Text };
        if (topic.FirstURL) entry.url = topic.FirstURL;
        results.push(entry);
      }
    }

    return { query: args["query"], results: results.slice(0, maxResults) };
  },
};
