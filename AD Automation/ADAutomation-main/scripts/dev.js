#!/usr/bin/env node
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const resolveCpuCapacity = () => {
  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }

  const cores = os.cpus();
  return Array.isArray(cores) && cores.length ? cores.length : 1;
};

const aggressiveDefaults = {
  PLANNER_CPU_THREADS: String(
    Math.max(1, (process.env.PLANNER_CPU_THREADS && Number(process.env.PLANNER_CPU_THREADS)) || resolveCpuCapacity() - 1)
  ),
  PLANNER_CPU_BATCH_SIZE: '1024',
  PLANNER_CONTEXT_SIZE: '3072',
  PLANNER_MAX_TOKENS: '384',
  PLANNER_GPU_LAYERS: '32',
  NODE_LLAMA_CPP_CUDA: '1',
  NODE_LLAMA_CPP_GPU: 'cuda',
  HOST: '0.0.0.0',
  ALLOWED_ORIGINS: '*'
};

if (!process.env.NVIDIA_VISIBLE_DEVICES) {
  process.env.NVIDIA_VISIBLE_DEVICES = 'all';
}

const ensureCudaBinaries = async () => {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const workspaceNodeModules = path.join(repoRoot, 'node_modules');
    const backendNodeModules = path.join(repoRoot, 'backend', 'node_modules');
    const modulesRoot = fs.existsSync(backendNodeModules) ? backendNodeModules : workspaceNodeModules;

    const cudaBinsDir = path.join(
      modulesRoot,
      '@node-llama-cpp',
      'linux-x64-cuda',
      'bins',
      'linux-x64-cuda'
    );
    if (!fs.existsSync(cudaBinsDir)) {
      return;
    }

    const extBinsDir = path.join(
      modulesRoot,
      '@node-llama-cpp',
      'linux-x64-cuda-ext',
      'bins',
      'linux-x64-cuda-ext'
    );

    const libPaths = [cudaBinsDir];
    if (fs.existsSync(extBinsDir)) {
      libPaths.push(extBinsDir);
    }

    const combinedLibPath = libPaths.join(':');
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${combinedLibPath}:${process.env.LD_LIBRARY_PATH}`
      : combinedLibPath;

    process.env.NODE_PATH = modulesRoot;

    if (!process.env.NODE_LLAMA_CPP_GPU) {
      process.env.NODE_LLAMA_CPP_GPU = 'cuda';
    }

    if (!process.env.LLAMA_CUDA) {
      process.env.LLAMA_CUDA = '1';
    }
  } catch (error) {
    console.warn(`[dev] Failed to configure CUDA binaries: ${error.message}`);
  }
};

for (const [key, value] of Object.entries(aggressiveDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

ensureCudaBinaries()
  .catch((error) => {
    console.warn(`[dev] CUDA sync error: ${error.message}`);
  })
  .finally(() => {
    startDevRuntime();
  });

function startDevRuntime() {
  const child = spawn('npm', ['run', 'dev:runtime'], {
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}
