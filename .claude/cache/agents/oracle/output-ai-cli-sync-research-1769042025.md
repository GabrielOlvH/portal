# Research Report: AI Coding CLI Configuration Files for Syncing
Generated: 2026-01-21

## Summary

AI coding CLIs store configuration in tool-specific directories with varying structures. The most sync-worthy assets are: (1) instruction/rules files (markdown), (2) custom commands/skills, (3) MCP server configurations, and (4) agent/model settings. Claude Code and Codex CLI have the most mature configuration systems with clear separation of concerns.

## Questions Answered

### Q1: What files/folders does Claude Code CLI use?
**Answer:** `~/.claude/` directory with multiple subdirectories and config files
**Source:** [Claude Code Settings Docs](https://code.claude.com/docs/en/settings)
**Confidence:** High (verified locally)

### Q2: What files/folders does Codex CLI use?
**Answer:** `~/.codex/` directory with TOML config, skills, and rules
**Source:** [Codex CLI Config Docs](https://developers.openai.com/codex/config-reference/)
**Confidence:** High (verified locally)

### Q3: What files/folders does OpenCode CLI use?
**Answer:** `~/.config/opencode/` with JSON/JSONC config files
**Source:** [OpenCode Config Docs](https://opencode.ai/docs/config/)
**Confidence:** High

### Q4: What other AI CLIs should be considered?
**Answer:** Aider, Cursor, Continue.dev, Cline, Windsurf, Zed
**Source:** Multiple sources
**Confidence:** High

---

## Detailed Findings by Tool

### 1. Claude Code CLI (`~/.claude/`)

**Source:** [Claude Code Settings](https://code.claude.com/docs/en/settings), [ClaudeLog Guide](https://claudelog.com/configuration/)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.claude/settings.json` | Global settings, hooks, permissions | HIGH |
| `~/.claude/rules/*.md` | Global instruction rules (markdown) | HIGH |
| `~/.claude/agents/*.md` | Custom AI subagents definitions | HIGH |
| `~/.claude/commands/*.md` | Custom slash commands | HIGH |
| `~/.claude/hooks/` | Pre/post tool use hooks (scripts) | MEDIUM |
| `~/.claude/CLAUDE.md` | Global memory file | HIGH |

#### Non-Sync Files (Local/Session Data)

| Path | Purpose | Why Not Sync |
|------|---------|--------------|
| `~/.claude/history.jsonl` | Session history | Large, personal |
| `~/.claude/.credentials.json` | Auth credentials | Security |
| `~/.claude/cache/` | Cached data | Machine-specific |
| `~/.claude/debug/` | Debug logs | Temporary |
| `~/.claude/file-history/` | File change tracking | Machine-specific |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `.claude/settings.json` | Project settings (shared) | YES |
| `.claude/settings.local.json` | Personal project settings | NO |
| `.claude/agents/*.md` | Project-specific agents | YES |
| `.claude/commands/*.md` | Project-specific commands | YES |
| `CLAUDE.md` | Project memory/instructions | YES |
| `.mcp.json` | Project MCP servers | YES |

---

### 2. Codex CLI (`~/.codex/`)

**Source:** [Codex Config Reference](https://developers.openai.com/codex/config-reference/), [Codex Basic Config](https://developers.openai.com/codex/config-basic/)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.codex/config.toml` | Main config (model, approval policy, sandbox) | HIGH |
| `~/.codex/rules/*.rules` | Permission rules and patterns | HIGH |
| `~/.codex/skills/**/SKILL.md` | Custom skills (like Claude commands) | HIGH |

#### Non-Sync Files

| Path | Purpose | Why Not Sync |
|------|---------|--------------|
| `~/.codex/auth.json` | API authentication | Security |
| `~/.codex/history.jsonl` | Session transcripts | Large, personal |
| `~/.codex/sessions/` | Session data | Machine-specific |
| `~/.codex/models_cache.json` | Model metadata cache | Auto-generated |

#### Example Config Structure (Observed)
```toml
model = "gpt-5.2-codex"
model_reasoning_effort = "high"

[projects."/path/to/project"]
trust_level = "trusted"
```

---

### 3. OpenCode CLI (`~/.config/opencode/`)

**Source:** [OpenCode Config Docs](https://opencode.ai/docs/config/)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.config/opencode/opencode.json` | Global config (model, keybinds, formatter) | HIGH |
| `~/.config/opencode/command/*.md` | Custom commands (markdown) | HIGH |
| `~/.config/opencode/instructions/*.md` | Instruction files | HIGH |

#### Non-Sync Files

| Path | Purpose | Why Not Sync |
|------|---------|--------------|
| `~/.local/share/opencode/auth.json` | API keys | Security |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `opencode.json` / `opencode.jsonc` | Project config | YES |
| `.opencode/command/*.md` | Project commands | YES |

---

### 4. Aider (`~/.aider*/`)

**Source:** [Aider Config Docs](https://aider.chat/docs/config.html), [Aider YAML Config](https://aider.chat/docs/config/aider_conf.html)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.aider.conf.yml` | Main YAML config | HIGH |
| `~/.aider.model.settings.yml` | Model-specific settings | MEDIUM |
| `~/.aider.model.metadata.json` | Custom model metadata | LOW |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `.aider.conf.yml` | Project config | YES |
| `.aiderignore` | Files to exclude | YES |
| `CONVENTIONS.md` | Coding conventions | YES |

#### Key Config Options
```yaml
model: claude-sonnet-4-20250514
dark-mode: true
auto-commits: false
read:
  - CONVENTIONS.md
  - docs/architecture.md
```

---

### 5. Cursor IDE (`~/.cursor/`)

**Source:** [Cursor Settings Sync Guide](https://dev.to/0916dhkim/sync-cursor-settings-the-dotfiles-way-20c9)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.cursor/mcp.json` | MCP server configuration | HIGH |
| `~/.cursor/commands/` | Custom commands | HIGH |

#### Platform-Specific Settings

| Platform | Settings Path |
|----------|---------------|
| macOS | `~/Library/Application Support/Cursor/User/settings.json` |
| Linux | `~/.config/Cursor/User/settings.json` |
| Windows | `%APPDATA%\Cursor\User\settings.json` |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `.cursorrules` | AI instruction rules | YES |

---

### 6. Continue.dev (`~/.continue/`)

**Source:** [Continue Config Docs](https://docs.continue.dev/customize/deep-dives/configuration)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.continue/config.yaml` | Main config (recommended over JSON) | HIGH |
| `~/.continue/config.json` | Legacy config format | MEDIUM |
| `~/.continue/config.ts` | Programmatic config | MEDIUM |
| `~/.continue/rules/*.md` | AI behavior rules | HIGH |
| `~/.continue/mcpServers/` | MCP server configs | HIGH |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `.continuerc.json` | Project overrides | YES |

---

### 7. Windsurf (Codeium) (`~/.codeium/windsurf/`)

**Source:** [Windsurf MCP Guide](https://www.braingrid.ai/blog/windsurf-mcp)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.codeium/windsurf/mcp_config.json` | MCP server configuration | HIGH |

---

### 8. Zed Editor (`~/.config/zed/`)

**Source:** [Zed Agent Settings](https://zed.dev/docs/ai/agent-settings), [Zed Configuration](https://zed.dev/docs/configuring-zed)

#### Sync-Worthy Files

| Path | Purpose | Sync Priority |
|------|---------|---------------|
| `~/.config/zed/settings.json` | Editor and AI settings | HIGH |
| `~/.config/zed/themes/` | Custom themes | LOW |

#### Project-Level Files

| Path | Purpose | Sync in Repo |
|------|---------|--------------|
| `.zed/rules/*.md` | AI rules files | YES |

---

### 9. Cline (VSCode Extension)

**Source:** [Cline Wiki](https://github.com/cline/cline/wiki)

#### Storage Location
Cline stores settings within VSCode's extension storage, not in separate config files. Configuration is done through VSCode settings and the extension UI.

#### Sync-Worthy (via VSCode)

| Setting | Purpose |
|---------|---------|
| API Provider config | Model selection |
| Custom prompts/roles | AI behavior |
| Temperature settings | Response tuning |

---

## Comparison Matrix

| Tool | Config Format | Instructions | Commands | MCP Support | Rules |
|------|---------------|--------------|----------|-------------|-------|
| Claude Code | JSON + MD | CLAUDE.md | ~/.claude/commands/*.md | .mcp.json | ~/.claude/rules/*.md |
| Codex CLI | TOML | N/A | ~/.codex/skills/**/SKILL.md | config.toml | ~/.codex/rules/ |
| OpenCode | JSON/JSONC | instructions/*.md | command/*.md | N/A | N/A |
| Aider | YAML | CONVENTIONS.md | N/A | N/A | N/A |
| Cursor | JSON | .cursorrules | commands/ | mcp.json | N/A |
| Continue | YAML/JSON | config | N/A | mcpServers/ | rules/*.md |
| Windsurf | JSON | memories | N/A | mcp_config.json | N/A |
| Zed | JSON | settings.json | N/A | MCP in settings | rules/*.md |

---

## Recommendations for Syncing

### Universal Sync Candidates (Portable Across Tools)

1. **Instruction/Rules Files (Markdown)**
   - Can be converted between formats
   - Core coding preferences, style guides
   - Path patterns: `rules/*.md`, `CLAUDE.md`, `.cursorrules`, `CONVENTIONS.md`

2. **MCP Server Configurations**
   - Similar JSON structure across tools
   - Path patterns: `.mcp.json`, `mcp.json`, `mcp_config.json`

3. **Custom Commands/Skills**
   - Markdown-based in most tools
   - Path patterns: `commands/*.md`, `skills/**/SKILL.md`

### Tool-Specific Sync (Keep Separate)

1. **Model/Provider Settings** - Different model naming across providers
2. **Approval Policies** - Tool-specific permission systems
3. **Hook Scripts** - Claude Code specific, not portable

### Security: Never Sync

- `auth.json`, `.credentials.json` - API keys
- `history.jsonl` - Session data
- Any file with `Bearer` tokens or API keys

---

## Proposed Sync Structure

```
~/.ai-config/
├── shared/
│   ├── instructions/
│   │   ├── coding-style.md
│   │   ├── security-rules.md
│   │   └── project-conventions.md
│   ├── commands/
│   │   ├── debug.md
│   │   ├── review.md
│   │   └── refactor.md
│   └── mcp-servers/
│       └── common-servers.json
├── claude/
│   ├── settings.json
│   ├── agents/ → symlink to shared or tool-specific
│   └── rules/ → symlink to shared/instructions
├── codex/
│   ├── config.toml
│   └── skills/ → symlink to shared/commands
├── opencode/
│   └── opencode.json
├── aider/
│   └── .aider.conf.yml
└── cursor/
    └── mcp.json → symlink to shared/mcp-servers
```

---

## Sources

1. [Claude Code Settings Documentation](https://code.claude.com/docs/en/settings)
2. [ClaudeLog Configuration Guide](https://claudelog.com/configuration/)
3. [Codex CLI Config Reference](https://developers.openai.com/codex/config-reference/)
4. [Codex Basic Configuration](https://developers.openai.com/codex/config-basic/)
5. [OpenCode Config Documentation](https://opencode.ai/docs/config/)
6. [Aider Configuration Guide](https://aider.chat/docs/config.html)
7. [Aider YAML Config](https://aider.chat/docs/config/aider_conf.html)
8. [Cursor Settings Sync Guide](https://dev.to/0916dhkim/sync-cursor-settings-the-dotfiles-way-20c9)
9. [Continue.dev Configuration](https://docs.continue.dev/customize/deep-dives/configuration)
10. [Windsurf MCP Setup Guide](https://www.braingrid.ai/blog/windsurf-mcp)
11. [Zed Agent Settings](https://zed.dev/docs/ai/agent-settings)
12. [Cline GitHub Wiki](https://github.com/cline/cline/wiki)

## Open Questions

- How to handle model name differences (e.g., `claude-sonnet-4` vs `anthropic/claude-sonnet-4`)?
- Should MCP servers be centrally managed or per-tool?
- How to sync approval/permission policies with different granularity?
