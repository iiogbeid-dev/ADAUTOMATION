import path from 'node:path';
import { config } from './index.js';

const sandboxRoot = path.resolve(process.cwd(), config.automationSandboxPath);
const composeFile = path.join(sandboxRoot, 'docker-compose.yml');

export const executorConfig = {
  dockerCommand: process.env.DOCKER_COMMAND || 'docker',
  composeFile,
  composeProject: process.env.LAB_COMPOSE_PROJECT || 'ad-lab',
  sandboxWorkingDir: sandboxRoot,
  dcService: process.env.LAB_DC_SERVICE || 'domain-controller',
  domainAdminUser: process.env.LAB_DOMAIN_ADMIN || 'Administrator',
  domainAdminPassword: process.env.LAB_DOMAIN_PASSWORD || 'ChangeMe123!',
  defaultRealm: process.env.LAB_REALM || 'EXAMPLE.LOCAL',
  defaultDomainNetbios: process.env.LAB_NETBIOS || 'EXAMPLE'
};
