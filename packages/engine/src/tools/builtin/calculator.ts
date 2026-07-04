import { evaluate } from "mathjs";
import type { RegisteredTool } from "../registry";

export const calculatorTool: RegisteredTool = {
  name: "calculator",
  description:
    "Evaluate a mathematical expression and return the numeric result. Supports arithmetic, algebra, units, and common math functions.",
  inputSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The math expression to evaluate, e.g. '2 + 2' or 'sqrt(16) * 3'",
      },
    },
    required: ["expression"],
  },
  async execute(args) {
    const expr = args["expression"] as string;
    try {
      const result: unknown = evaluate(expr);
      return { result: String(result) };
    } catch (err) {
      throw new Error(`Calculator error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
