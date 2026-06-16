#!/usr/bin/env node
//
// UserPromptSubmit hook — two routing passes, one additionalContext block:
//
//  1. SKILL ROUTER: scans SKILL.md files (project, personal, plugin) and
//     keyword-matches them against the prompt.
//
//  2. MCP ROUTER: keyword-matches against a hardcoded registry of the MCPs
//     available in this session (GitHub, Gmail, Drive, Canva, Vercel, etc.).
//     MCP tools can't be discovered from the filesystem so the registry is
//     embedded here — update it when new MCPs are added.
//
// Neither pass blocks the prompt; they only inject hints.

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── MCP registry ────────────────────────────────────────────────────────────
// Each entry: { name, toolPrefix, description, aliases[] }
// `aliases` are extra high-value trigger words beyond the description tokens.
const MCP_REGISTRY = [
  {
    name: 'github',
    toolPrefix: 'mcp__github__',
    description: 'Interact with GitHub repositories: create or review pull requests, open or read issues, list commits and branches, search code, trigger CI actions, post review comments, merge PRs.',
    aliases: ['pr', 'repo', 'ci', 'workflow', 'merge', 'diff', 'fork', 'tag', 'release'],
  },
  {
    name: 'gmail',
    toolPrefix: 'mcp__Gmail__',
    description: 'Read, search, draft, label and manage Gmail emails and threads.',
    aliases: ['email', 'inbox', 'mail', 'thread', 'message', 'send', 'draft'],
  },
  {
    name: 'google-drive',
    toolPrefix: 'mcp__Google_Drive__',
    description: 'Search, read, create, copy and download files from Google Drive including Docs, Sheets, Slides and PDFs.',
    aliases: ['gdrive', 'drive', 'doc', 'sheet', 'spreadsheet', 'slides', 'google'],
  },
  {
    name: 'canva',
    toolPrefix: 'mcp__Canva__',
    description: 'Create and edit Canva designs: generate from templates, perform editing operations, export as PDF or image, manage brand kits and assets, import external designs.',
    aliases: ['design', 'graphic', 'banner', 'poster', 'thumbnail', 'branding', 'logo', 'visual'],
  },
  {
    name: 'vercel',
    toolPrefix: 'mcp__Vercel__',
    description: 'Deploy projects to Vercel, check deployment status and build logs, view runtime logs, manage projects, teams and domains, check domain availability.',
    aliases: ['deploy', 'hosting', 'serverless', 'edge', 'cdn', 'preview', 'production'],
  },
  {
    name: 'gamma',
    toolPrefix: 'mcp__Gamma__',
    description: 'Generate AI-powered presentations, slide decks, documents and webpages from text. Create from templates or generate freely.',
    aliases: ['presentation', 'deck', 'slides', 'powerpoint', 'keynote', 'pitch', 'report'],
  },
  {
    name: 'exa',
    toolPrefix: 'mcp__Exa__',
    description: 'Search the web and fetch URLs for real-time research, news, documentation and information retrieval.',
    aliases: ['search', 'web', 'internet', 'browse', 'research', 'lookup', 'find', 'news', 'fetch'],
  },
  {
    name: 'higgsfield',
    toolPrefix: 'mcp__higgsfield__',
    description: 'Generate AI images, videos and audio. Create animations, 3D models, upscale and reframe media, remove backgrounds, predict video virality, build and deploy browser games.',
    aliases: ['image', 'video', 'audio', 'animation', 'generate', 'ai-art', 'upscale', 'game', '3d', 'clip'],
  },
  {
    name: 'clerk',
    toolPrefix: 'mcp__Clerk__',
    description: 'Get Clerk authentication SDK code snippets for adding sign-in, sign-up and user management to web apps.',
    aliases: ['auth', 'authentication', 'login', 'signup', 'user', 'session', 'jwt', 'oauth'],
  },
  {
    name: 'microsoft-learn',
    toolPrefix: 'mcp__Microsoft_Learn__',
    description: 'Search and fetch official Microsoft and Azure documentation, tutorials and code samples for .NET, Azure, TypeScript, C# and other Microsoft technologies.',
    aliases: ['azure', 'microsoft', 'dotnet', 'csharp', 'typescript', 'azure-function', 'cosmos', 'bicep'],
  },
  {
    name: 'claude-mem',
    toolPrefix: 'mcp__plugin_claude-mem_mcp-search__',
    description: 'Search and query claude-mem persistent cross-session memory: find past observations, add memories, search the project corpus, get memory context for the current session.',
    aliases: ['memory', 'remember', 'past', 'previous', 'history', 'observation', 'context', 'recall'],
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','for','to','of','in','on','at','by','with',
  'is','are','was','were','be','been','being','this','that','these','those','it','its','as',
  'i','you','your','my','me','we','our','us','they','them','their','am',
  'do','does','did','can','could','will','would','should','shall','may','might','must',
  'have','has','had','not','no','yes','so','just','please','want','needs','like','get','got',
  'about','into','out','up','down','over','under','again','more','most','some','such','only',
  'also','than','too','very','what','which','who','whom','when','where','why','how','all','any',
  'each','other','same','from','one','now'
]);

function tokenize(text) {
  const raw = text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) || [];
  const tokens = [];
  for (const word of raw) {
    if (word.length > 2 && !STOPWORDS.has(word)) tokens.push(word);
    if (word.includes('-')) {
      for (const part of word.split('-')) {
        if (part.length > 2 && !STOPWORDS.has(part)) tokens.push(part);
      }
    }
  }
  return tokens;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreAgainstTokens(promptTokens, promptLower, name, description, aliases = []) {
  const contentTokens = tokenize(`${name} ${description} ${aliases.join(' ')}`);
  let score = 0;
  for (const token of contentTokens) {
    if (promptTokens.has(token)) score += token.length >= 5 ? 2 : 1;
  }
  // Alias exact-word bonus (aliases are curated high-signal terms)
  for (const alias of aliases) {
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
    if (pattern.test(promptLower)) score += 4;
  }
  return score;
}

// ── Skill routing ─────────────────────────────────────────────────────────────
function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  if (!nameMatch || !descMatch) return null;
  const clean = (s) => s.trim().replace(/^["']|["']$/g, '');
  return { name: clean(nameMatch[1]), description: clean(descMatch[1]) };
}

function findSkillFiles(dir, maxDepth = 5) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [[dir, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && depth < maxDepth) stack.push([full, depth + 1]);
      else if (entry.isFile() && entry.name === 'SKILL.md') results.push(full);
    }
  }
  return results;
}

function routeSkills(promptTokens, promptLower, projectDir, home) {
  const searchDirs = [
    path.join(projectDir, '.claude', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.claude', 'plugins', 'marketplaces'),
  ];
  const seen = new Set();
  const skills = [];
  for (const dir of searchDirs) {
    for (const file of findSkillFiles(dir)) {
      try {
        const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        if (!fm || seen.has(fm.name)) continue;
        seen.add(fm.name);
        skills.push(fm);
      } catch { /* skip */ }
    }
  }

  const scored = skills.map((skill) => {
    let score = scoreAgainstTokens(promptTokens, promptLower, skill.name, skill.description);
    if (tokenize(skill.name).length > 0) {
      const pat = new RegExp(`\\b${escapeRegExp(skill.name.toLowerCase()).replace(/-/g, '[\\s-]')}\\b`);
      if (pat.test(promptLower)) score += 5;
    }
    return { ...skill, score };
  });

  return scored.sort((a, b) => b.score - a.score).filter((s) => s.score >= 3).slice(0, 3);
}

// ── MCP routing ───────────────────────────────────────────────────────────────
function routeMcps(promptTokens, promptLower) {
  const scored = MCP_REGISTRY.map((mcp) => ({
    ...mcp,
    score: scoreAgainstTokens(promptTokens, promptLower, mcp.name, mcp.description, mcp.aliases),
  }));
  return scored.sort((a, b) => b.score - a.score).filter((s) => s.score >= 4).slice(0, 3);
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let input = {};
  try { input = JSON.parse(raw); } catch { return; }

  const prompt = input.prompt || '';
  if (!prompt.trim()) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const home = os.homedir();
  const promptTokens = new Set(tokenize(prompt));
  if (promptTokens.size === 0) return;
  const promptLower = prompt.toLowerCase();

  const topSkills = routeSkills(promptTokens, promptLower, projectDir, home);
  const topMcps = routeMcps(promptTokens, promptLower);

  if (topSkills.length === 0 && topMcps.length === 0) return;

  const parts = [];
  if (topSkills.length > 0) {
    parts.push('[skill-router] Keyword match against available skills suggests these may be relevant to this prompt:');
    for (const s of topSkills) parts.push(`- ${s.name}: ${s.description}`);
    parts.push('If one genuinely fits, invoke it via the Skill tool before doing anything else. If none fit, ignore this hint.');
  }
  if (topMcps.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push('[mcp-router] These MCP servers may have tools relevant to this prompt:');
    for (const m of topMcps) parts.push(`- ${m.name} (${m.toolPrefix}*): ${m.description}`);
    parts.push('Load the schema first with ToolSearch before calling any MCP tool.');
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: parts.join('\n'),
      },
    })
  );
}

try {
  main();
} catch {
  // never block the prompt on a router failure
}
