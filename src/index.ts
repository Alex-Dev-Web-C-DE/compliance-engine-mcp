import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const PORT = process.env.PORT || 8080;
const COMPLIANCE_API = "https://compliance-engine.boring-saas-infra.workers.dev";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "compliance-engine-mcp",
    version: "1.0.0",
  });
});

// MCP server factory
function createMcpServer() {
  const server = new McpServer({
    name: "compliance-engine",
    version: "1.0.0",
  });

  server.tool(
    "check_sanctions",
    "Screen a person or entity against global sanctions lists (OFAC SDN, UK OFSI, EU Consolidated, UN Consolidated). Returns matches with confidence scores.",
    {
      query: z.string().describe("Name to screen (person or entity)"),
      threshold: z.number().optional().describe("Match confidence threshold (0-1, default 0.82)"),
      limit: z.number().optional().describe("Max results (default 10)"),
    },
    async ({ query, threshold, limit }) => {
      const params = new URLSearchParams({ q: query });
      if (threshold !== undefined) params.set("threshold", String(threshold));
      if (limit !== undefined) params.set("limit", String(limit));

      const url = `${COMPLIANCE_API}/check/sanctions?${params}`;
      const r = await fetch(url);
      const data = await r.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "check_pep",
    "Check if a person is a Politically Exposed Person (PEP). 11.7K+ PEP records from Wikidata.",
    {
      query: z.string().describe("Person name to check"),
      threshold: z.number().optional().describe("Match confidence threshold (0-1, default 0.82)"),
    },
    async ({ query, threshold }) => {
      const params = new URLSearchParams({ q: query });
      if (threshold !== undefined) params.set("threshold", String(threshold));

      const url = `${COMPLIANCE_API}/check/pep?${params}`;
      const r = await fetch(url);
      const data = await r.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "check_entity",
    "Search legal entities by name in GLEIF database (20K+ records). Returns LEI, legal name, jurisdiction.",
    {
      query: z.string().describe("Entity name to search"),
      threshold: z.number().optional().describe("Match confidence threshold (0-1, default 0.82)"),
    },
    async ({ query, threshold }) => {
      const params = new URLSearchParams({ q: query });
      if (threshold !== undefined) params.set("threshold", String(threshold));

      const url = `${COMPLIANCE_API}/check/entity?${params}`;
      const r = await fetch(url);
      const data = await r.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  return server;
}

// MCP endpoint (streamable HTTP)
app.post("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (req, res) => {
  res.status(405).json({ error: "Use POST for MCP requests" });
});

app.listen(PORT, () => {
  console.log(`Compliance Engine MCP running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP: http://localhost:${PORT}/mcp`);
});