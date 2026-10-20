import { spawn } from 'node:child_process';
import { executorConfig } from '../../config/executorConfig.js';

function captureOutput(stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
  });
  return () => buffer;
}

async function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const getStdout = captureOutput(child.stdout);
    const getStderr = captureOutput(child.stderr);

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout: getStdout(),
        stderr: getStderr()
      });
    });
  });
}

export async function runDcCommand(dcArgs) {
  const commandArgs = Array.isArray(dcArgs) ? [...dcArgs] : [];
  if (
    commandArgs.length &&
    commandArgs[0] === 'samba-tool' &&
    !commandArgs.some((arg) => typeof arg === 'string' && /^-U\b/.test(arg))
  ) {
    commandArgs.push('-U', `${executorConfig.domainAdminUser}%${executorConfig.domainAdminPassword}`);
  }

  const args = [
    'compose',
    '-f',
    executorConfig.composeFile,
    '--project-name',
    executorConfig.composeProject,
    'exec',
    '-T',
    executorConfig.dcService,
    ...commandArgs
  ];

  const result = await runCommand(executorConfig.dockerCommand, args, {
    cwd: executorConfig.sandboxWorkingDir
  });

  if (result.code !== 0) {
    const error = new Error(
      `Command "${executorConfig.dockerCommand} ${args.join(' ')}" failed with exit code ${result.code}`
    );
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.code = result.code;
    throw error;
  }

  return result;
}

export async function runHostSshCommand(hostname, sshArgs) {
  const commandArgs = [
    'compose',
    '-f',
    executorConfig.composeFile,
    '--project-name',
    executorConfig.composeProject,
    'exec',
    '-T',
    hostname,
    ...sshArgs
  ];

  const result = await runCommand(executorConfig.dockerCommand, commandArgs, {
    cwd: executorConfig.sandboxWorkingDir
  });

  if (result.code !== 0) {
    const error = new Error(
      `Command "${executorConfig.dockerCommand} ${commandArgs.join(' ')}" failed with exit code ${result.code}`
    );
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.code = result.code;
    throw error;
  }

  return result;
}
