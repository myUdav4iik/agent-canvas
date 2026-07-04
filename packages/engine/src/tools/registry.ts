import type { ToolSchema } from "../adapters/base";
import type { RunContext } from "../safety/guards";

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: RunContext): Promise<unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: RunContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args, ctx);
  }

  /** Returns schemas for the subset of tools an agent has access to */
  getSchemasFor(toolNames: string[]): ToolSchema[] {
    return toolNames
      .map((n) => this.tools.get(n))
      .filter((t): t is RegisteredTool => t !== undefined)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
  }

  getAll(): RegisteredTool[] {
    return [...this.tools.values()];
  }
}
