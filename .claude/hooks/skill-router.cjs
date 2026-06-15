#!/usr/bin/env node
//
// UserPromptSubmit hook: scans all SKILL.md files available to this session
// (project, personal, and plugin-provided skills), keyword-matches them
// against the prompt, and injects a hint naming the best candidate(s).
// This is a heuristic nudge on top of Claude's built-in skill matching --
// it never blocks the prompt, it just suggests.

const fs = require('fs');
const path = require('path');
const os = require('os');

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
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && depth < maxDepth) {
        stack.push([full, depth + 1]);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(full);
      }
    }
  }
  return results;
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return;
  }

  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const prompt = input.prompt || '';
  if (!prompt.trim()) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const home = os.homedir();

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
      } catch {
        // skip unreadable/malformed files
      }
    }
  }

  const promptTokens = new Set(tokenize(prompt));
  if (promptTokens.size === 0) return;

  const promptLower = prompt.toLowerCase();

  const scored = skills.map((skill) => {
    const skillTokens = tokenize(`${skill.name} ${skill.description}`);
    let score = 0;
    for (const token of skillTokens) {
      if (promptTokens.has(token)) score += token.length >= 5 ? 2 : 1;
    }
    // Only count a name match if the name itself is meaningful (not a
    // short/common word like "do" or "run" that matches by coincidence).
    if (tokenize(skill.name).length > 0) {
      const namePattern = new RegExp(
        `\\b${escapeRegExp(skill.name.toLowerCase()).replace(/-/g, '[\\s-]')}\\b`
      );
      if (namePattern.test(promptLower)) score += 5;
    }
    return { ...skill, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const MIN_SCORE = 3;
  const top = scored.filter((s) => s.score >= MIN_SCORE).slice(0, 3);
  if (top.length === 0) return;

  const lines = top.map((s) => `- ${s.name}: ${s.description}`);
  const context = [
    '[skill-router] Keyword match against available skills suggests these may be relevant to this prompt:',
    ...lines,
    'If one genuinely fits, invoke it via the Skill tool before doing anything else. If none fit, ignore this hint.',
  ].join('\n');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    })
  );
}

try {
  main();
} catch {
  // never block the prompt on a router failure
}
