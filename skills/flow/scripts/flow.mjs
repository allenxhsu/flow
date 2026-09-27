#!/usr/bin/env node
// The /flow skill's entry point: runs the repo's cli/flow.mjs. Node resolves
// this file through the .claude/skills/flow symlink to its real place in the
// repo, so the relative import below finds the CLI wherever the skill is linked.
import { run } from '../../../cli/flow.mjs';

await run();
