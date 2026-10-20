import { performance } from 'node:perf_hooks';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { plannerConfig } from '../../config/plannerConfig.js';

let llamaPromise;
let modelPromise;

const TEMPLATING_PATTERN = /(\{\{|\}\}|\{%|%\}|<<|>>)/;
const STRICT_YAML_REMINDER = [
  'IMPORTANT:',
  '- Output only YAML.',
  '- Start with `version: "1.0"` followed by `metadata` and `actions` keys.',
  '- metadata must include `intent`, `source_prompt`, `confidence`.',
  '- actions must be a list of objects with `action` and `parameters` keys.',
  '- Only use allowed action names and snake_case parameter keys.',
  '- Do not include commentary, explanations, code fences, or templating syntax.',
  '- Do not use meta actions such as for_each, loops, or templates; enumerate each step as an explicit allowed action.'
].join('\n');

async function getLlamaInstance() {
  if (!llamaPromise) {
    const wantsGpu = plannerConfig.model.gpuLayers > 0;
    llamaPromise = (async () => {
      if (wantsGpu) {
        try {
          const cudaLlama = await getLlama({
            gpu: 'cuda',
            logLevel: 'warn',
            progressLogs: false,
            usePrebuiltBinaries: true
          });
          console.log(`[planner] llama backend initialised with CUDA (${cudaLlama.gpu}) support.`);
          return cudaLlama;
        } catch (error) {
          console.warn(
            `[planner] Failed to initialise llama backend with CUDA (${error.message}). Falling back to CPU bindings.`
          );
        }
      }

      const cpuLlama = await getLlama({
        gpu: false,
        logLevel: 'warn',
        progressLogs: false,
        usePrebuiltBinaries: true
      });
      if (cpuLlama.gpu === false) {
        console.log('[planner] llama backend initialised in CPU mode.');
      }
      return cpuLlama;
    })().catch((error) => {
      llamaPromise = undefined;
      throw error;
    });
  }
  return llamaPromise;
}

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const llama = await getLlamaInstance();
      const { path: modelPath, gpuLayers, batchSize } = plannerConfig.model;

      const loadWithLayers = async (layers) =>
        llama.loadModel({
          modelPath,
          gpuLayers: layers > 0 ? layers : 0,
          defaultContextFlashAttention: true,
          defaultContextSwaFullCache: false,
          useMmap: true,
          ignoreMemorySafetyChecks: true
        });

      try {
        const desiredLayers = gpuLayers > 0 && llama.gpu !== false ? gpuLayers : 0;
        const model = await loadWithLayers(desiredLayers);
        const executionMode =
          model.gpuLayers > 0 ? `cuda (layers=${model.gpuLayers})` : `cpu (threads=${plannerConfig.model.threads})`;
        console.log(
          `[planner] Model loaded in ${executionMode}, batchSize=${batchSize}, contextSize=${plannerConfig.model.contextSize}`
        );
        return model;
      } catch (error) {
        if (gpuLayers > 0) {
          console.warn(
            `[planner] Failed to load model with requested gpuLayers=${gpuLayers}. Retrying on CPU. (${error.message})`
          );
          const cpuModel = await loadWithLayers(0);
          console.log(
            `[planner] Model loaded on CPU after GPU fallback, batchSize=${batchSize}, contextSize=${plannerConfig.model.contextSize}`
          );
          return cpuModel;
        }
        modelPromise = undefined;
        throw error;
      }
    })();
  }
  return modelPromise;
}

function createThreadOptions(threads) {
  if (!threads || threads <= 0) return undefined;
  const minThreads = Math.max(1, Math.floor(threads / 2));
  return {
    ideal: threads,
    min: minThreads
  };
}

async function generatePlanYamlImpl(prompt, attempt = 0) {
  const model = await getModel();
  const threadsOption = createThreadOptions(plannerConfig.model.threads);

  const context = await model.createContext({
    contextSize: plannerConfig.model.contextSize,
    batchSize: plannerConfig.model.batchSize,
    threads: threadsOption,
    flashAttention: true,
    performanceTracking: true,
    ignoreMemorySafetyChecks: true
  });

  let session;
  let resultYaml = null;
  let retryPrompt = null;
  const sequence = context.getSequence();
  try {
    session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: plannerConfig.systemPrompt,
      chatWrapper: 'auto',
      autoDisposeSequence: true,
      forceAddSystemPrompt: true
    });

    const promptTokens = model.tokenize(prompt).length;
    let completionTokenCount = 0;

    const generationStart = performance.now();
    const { responseText, stopReason } = await session.promptWithMeta(prompt, {
      temperature: plannerConfig.model.temperature,
      topP: plannerConfig.model.topP,
      repeatPenalty: {
        penalty: plannerConfig.model.repeatPenalty
      },
      maxTokens: plannerConfig.model.maxTokens,
      trimWhitespaceSuffix: true,
      onToken: (tokens) => {
        if (Array.isArray(tokens)) {
          completionTokenCount += tokens.length;
        }
      }
    });
    const generationMs = performance.now() - generationStart;

    console.log(
      `[planner] Generation completed in ${generationMs.toFixed(
        0
      )} ms (stopReason=${stopReason}, promptTokens=${promptTokens}, completionTokens=${completionTokenCount}, tokensPerSecond=${(
        completionTokenCount / Math.max(1, generationMs / 1000)
      ).toFixed(2)}, maxTokens=${plannerConfig.model.maxTokens})`
    );

    try {
      await context.printTimings();
    } catch (error) {
      console.warn('[planner] Failed to print llama.cpp timings:', error.message);
    }

    let cleaned = responseText.trim();

    const fencedMatch = cleaned.match(/```(?:yaml)?\s*([\s\S]+?)\s*```/i);
    if (fencedMatch) {
      cleaned = fencedMatch[1].trim();
    }

    if (!cleaned.startsWith('version:')) {
      const yamlStartMatch = cleaned.match(/^(version:|metadata:|actions:)/m);
      if (yamlStartMatch && typeof yamlStartMatch.index === 'number') {
        cleaned = cleaned.slice(yamlStartMatch.index).trim();
      }
    }

    const hasDisallowedAction = /\baction\s*:\s*(for_each|loop|bulk_[a-z_]+)/i.test(cleaned);

    if (TEMPLATING_PATTERN.test(cleaned)) {
      if (attempt === 0) {
        console.warn(
          '[planner] Detected templating syntax in planner output. Retrying with stricter YAML instructions.'
        );
        retryPrompt = `${prompt}\n\n${STRICT_YAML_REMINDER}`;
      } else {
        throw new Error('PLANNER_OUTPUT_CONTAINS_TEMPLATING');
      }
    } else if (hasDisallowedAction) {
      if (attempt === 0) {
        console.warn(
          '[planner] Detected disallowed action in planner output. Reinforcing allowed action instructions.'
        );
        retryPrompt = `${prompt}\n\n${STRICT_YAML_REMINDER}\nDo not use meta actions like for_each; expand each step using only the allowed action names.`;
      } else {
        throw new Error('PLANNER_OUTPUT_INVALID_ACTION');
      }
    } else if (!cleaned.startsWith('version:')) {
      if (attempt === 0) {
        console.warn(
          '[planner] Planner output did not start with version key. Reinforcing schema instructions and retrying.'
        );
        retryPrompt = `${prompt}\n\n${STRICT_YAML_REMINDER}`;
      } else {
        throw new Error('PLANNER_OUTPUT_INVALID_FORMAT');
      }
    } else {
      resultYaml = cleaned;
    }
  } finally {
    try {
      session?.dispose({ disposeSequence: true });
    } catch {
      // ignore dispose errors from synchronous dispose
    }
    await context.dispose();
  }

  if (retryPrompt) {
    return generatePlanYamlImpl(retryPrompt, attempt + 1);
  }

  if (resultYaml == null) {
    throw new Error('PLANNER_OUTPUT_EMPTY');
  }

  return resultYaml;
}

export const plannerRuntime = {
  generatePlanYaml: generatePlanYamlImpl
};

export async function generatePlanYaml(prompt) {
  return plannerRuntime.generatePlanYaml(prompt);
}
