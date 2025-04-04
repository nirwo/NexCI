#!/bin/bash

echo "🔧 Installing MCP servers..."
npm install --save-dev \
  @modelcontextprotocol/server-memory \
  @modelcontextprotocol/server-filesystem \
  @modelcontextprotocol/server-sqlite \
  @modelcontextprotocol/server-http \
  @modelcontextprotocol/server-static \
  @modelcontextprotocol/server-openai \
  @modelcontextprotocol/server-ollama

echo "✅ Done. Creating .mcp.json..."

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "./db.sqlite"]
    },
    "http": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-http", "https://api.example.com"]
    },
    "static": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-static", "./static-models"]
    },
    "openai": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-openai"]
    },
    "ollama": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-ollama"]
    }
  }
}
EOF

echo "🧠 .mcp.json created."