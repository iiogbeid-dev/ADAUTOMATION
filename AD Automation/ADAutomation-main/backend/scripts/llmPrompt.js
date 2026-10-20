#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { plannerRuntime } from '../src/services/llm/llamaPlanner.js';
import { parseAndValidatePlanYaml, PlanValidationError } from '../src/utils/validatePlanYaml.js';
import { plannerConfig } from '../src/config/plannerConfig.js';

function printUsage() {
  console.log(`LLM Debug CLI
Usage:
  node backend/scripts/llmPrompt.js [options] <prompt text>

Options:
  --file <path>        Read the prompt from a file instead of CLI args.
  --no-validate        Skip YAML validation step.
  --json               Emit JSON output for easier scripting.
  --direct             Send the prompt directly without the API wrapper.
  --help               Show this message.

Examples:
  node backend/scripts/llmPrompt.js "Create a user and add to Helpdesk"
  node backend/scripts/llmPrompt.js --no-validate --file prompt.txt
  node backend/scripts/llmPrompt.js --json "Reset Bob's password"
`);
}

function buildPlannerPrompt(prompt) {
  const trimmed = prompt.trim();

  return [
    'You will transform the following operator request into an automation plan.',
    'Respond with YAML that conforms exactly to the schema described in the system prompt.',
    'If the request is out of scope or unsafe, emit a single unsupported_request action with a reason.',
    'Operator request:',
    '```',
    trimmed,
    '```'
  ].join('\n');
}

async function parseArgs(argv) {
  const options = {
    validate: true,
    json: false,
    direct: false
  };
  const promptParts = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--no-validate':
        options.validate = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '--direct':
        options.direct = true;
        break;
      case '--file': {
        const filePath = argv[i + 1];
        if (!filePath) {
          throw new Error('--file requires a path argument.');
        }
        options.prompt = await readFile(filePath, 'utf8');
        i++;
        break;
      }
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        promptParts.push(arg);
        break;
    }
  }

  if (!options.prompt) {
    options.prompt = promptParts.join(' ').trim();
  }

  if (!options.prompt) {
    printUsage();
    process.exit(1);
  }

  return options;
}

async function main() {
  try {
    const startOverall = Date.now();
    const { validate, json, prompt, direct } = await parseArgs(process.argv.slice(2));

    const llmPrompt = direct ? prompt : buildPlannerPrompt(prompt);

    const startGen = Date.now();
    const yaml = await plannerRuntime.generatePlanYaml(llmPrompt);
    const generationMs = Date.now() - startGen;

    let validationResult = null;
    if (validate) {
      try {
        const parsed = parseAndValidatePlanYaml(yaml);
        validationResult = {
          ok: true,
          actionCount: parsed.actions.length,
          intent: parsed.metadata.intent
        };
      } catch (error) {
        if (error instanceof PlanValidationError) {
          validationResult = {
            ok: false,
            error: error.message,
            code: error.code,
            details: error.details
          };
        } else {
          validationResult = {
            ok: false,
            error: error.message
          };
        }
      }
    }

    const totalMs = Date.now() - startOverall;

    if (json) {
      const payload = {
        prompt,
        llmPrompt: direct ? prompt : llmPrompt,
        model: plannerConfig.model.id,
        timings: {
          generationMs,
          totalMs
        },
        yaml,
        validation: validationResult
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`Prompt:
${prompt}

LLM Prompt (effective):
${llmPrompt}

Model: ${plannerConfig.model.id}
Generation time: ${generationMs} ms
Total time: ${totalMs} ms
`);

    console.log('--- YAML ---');
    console.log(yaml);
    console.log('-------------');

    if (validationResult) {
      if (validationResult.ok) {
        console.log(`Validation: ✅ ${validationResult.actionCount} action(s), intent=${validationResult.intent}`);
      } else {
        console.log(`Validation: ❌ ${validationResult.code || 'ERROR'} - ${validationResult.error}`);
        if (validationResult.details && Object.keys(validationResult.details).length) {
          console.log('Details:', JSON.stringify(validationResult.details, null, 2));
        }
        process.exitCode = 2;
      }
    }
  } catch (error) {
    console.error('[llmPrompt] Failed:', error.message);
    process.exit(1);
  }
}

main();
