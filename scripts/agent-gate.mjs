#!/usr/bin/env node
// Reads the GitHub event and writes run=<bool>, attempt=<n>, issue=<n> to $GITHUB_OUTPUT.
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { shouldRunAgent } from '../src/core/agent-gate.ts';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
const dispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
const issue = dispatch ? Number(event.inputs.issue) : event.issue.number;
// Dispatch carries no labels, so read them fresh.
const labels = dispatch
  ? JSON.parse(execFileSync('gh', ['issue', 'view', String(issue), '--json', 'labels'], { encoding: 'utf8' })).labels.map((/** @type {{name: string}} */ l) => l.name)
  : event.issue.labels.map((/** @type {{name: string}} */ l) => l.name);

const result = shouldRunAgent({ action: dispatch ? 'dispatch' : event.action, addedLabel: event.label?.name, labels });
console.log(JSON.stringify({ issue, ...result }));
appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/null', `run=${result.run}\nissue=${issue}\nattempt=${result.run ? result.attempt : 0}\n`);
