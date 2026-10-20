import crypto from 'node:crypto';
import { runDcCommand } from './commandRunner.js';

const KNOWN_GROUPS = ['Helpdesk', 'Workstations', 'ITAdmins'];

function splitName(displayName) {
  if (!displayName) return { given: undefined, surname: undefined };
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { given: parts[0], surname: undefined };
  }
  return {
    given: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1]
  };
}

function normalizeOu(ou) {
  if (!ou) return ou;
  const cleaned = ou.replace(/,?DC=[^,]+/gi, '').replace(/^,|,$/g, '');
  return cleaned || ou;
}

function meetsComplexity(candidate = '') {
  const checks = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];
  return candidate.length >= 8 && checks.every((regex) => regex.test(candidate));
}

function looksLikePlaceholder(candidate = '') {
  return /\b(generated|changeme|temp|password)\b/i.test(candidate);
}

function generateStrongPassword(length = 14) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*_-+=';
  const randomBytes = () => crypto.randomBytes(length);

  const allocate = () => {
    const bytes = randomBytes();
    let password = '';
    for (let i = 0; i < length; i++) {
      password += alphabet[bytes[i] % alphabet.length];
    }
    return password;
  };

  let password = allocate();
  while (!meetsComplexity(password)) {
    password = allocate();
  }
  return password;
}

function ensureStrongPassword(requestedPassword) {
  if (requestedPassword && meetsComplexity(requestedPassword) && !looksLikePlaceholder(requestedPassword)) {
    return { password: requestedPassword, generated: false };
  }

  return { password: generateStrongPassword(), generated: true };
}

function addLog(log, message) {
  log.push({ at: new Date().toISOString(), message });
}

async function ensureGroupExists(group, log) {
  try {
    await runDcCommand(['samba-tool', 'group', 'show', group]);
  } catch (error) {
    addLog(
      log,
      `Group "${group}" was not found. Existing demo groups: ${KNOWN_GROUPS.join(
        ', '
      )}. Add a create_group action earlier in the plan before assigning members.`
    );
    const friendly = new Error(`Group "${group}" does not exist in the lab environment.`);
    friendly.cause = error;
    throw friendly;
  }
}

function isAlreadyMemberError(error) {
  const stderr = error?.stderr || '';
  const message = error?.message || '';
  return /already exists/i.test(stderr) || /already exists/i.test(message);
}

async function addMemberToGroup(group, username, log) {
  try {
    const result = await runDcCommand(['samba-tool', 'group', 'addmembers', group, username]);
    if (result.stdout.trim()) addLog(log, result.stdout.trim());
    if (result.stderr.trim()) addLog(log, result.stderr.trim());
  } catch (error) {
    if (isAlreadyMemberError(error)) {
      addLog(log, `User "${username}" is already a member of "${group}". Skipping.`);
      return;
    }
    throw error;
  }
}

async function createUser(parameters, log) {
  const {
    username,
    ou,
    display_name: displayName,
    email,
    password,
    groups = []
  } = parameters;

  if (!username || !ou) {
    throw new Error('create_user action requires username and ou parameters.');
  }

  const { password: userPassword, generated } = ensureStrongPassword(password);
  const names = splitName(displayName);

  addLog(log, `Creating user "${username}" in ${ou}`);

  const args = [
    'samba-tool',
    'user',
    'create',
    username,
    userPassword,
    `--userou=${normalizeOu(ou)}`,
    '--use-username-as-cn'
  ];

  if (names.given) {
    args.push(`--given-name=${names.given}`);
  }
  if (names.surname) {
    args.push(`--surname=${names.surname}`);
  }
  if (email) {
    args.push(`--mail-address=${email}`);
  }

  const result = await runDcCommand(args);

  if (result.stdout.trim()) addLog(log, result.stdout.trim());
  if (result.stderr.trim()) addLog(log, result.stderr.trim());

  for (const group of groups) {
    await ensureGroupExists(group, log);
    addLog(log, `Adding "${username}" to group "${group}"`);
    await addMemberToGroup(group, username, log);
  }

  if (generated) {
    addLog(log, `Generated secure password for "${username}": ${userPassword}`);
  }

  addLog(log, `User "${username}" created successfully.`);
}

async function addUserToGroup(parameters, log) {
  const { username, group } = parameters;

  if (!username || !group) {
    throw new Error('add_user_to_group action requires username and group parameters.');
  }

  await ensureGroupExists(group, log);
  addLog(log, `Adding "${username}" to group "${group}"`);
  await addMemberToGroup(group, username, log);
}

async function removeUserFromGroup(parameters, log) {
  const { username, group } = parameters;

  if (!username || !group) {
    throw new Error('remove_user_from_group action requires username and group parameters.');
  }

  await ensureGroupExists(group, log);
  addLog(log, `Removing "${username}" from group "${group}"`);
  const result = await runDcCommand(['samba-tool', 'group', 'removemembers', group, username]);

  if (result.stdout.trim()) addLog(log, result.stdout.trim());
  if (result.stderr.trim()) addLog(log, result.stderr.trim());
}

async function createGroup(parameters, log) {
  const { group, ou, scope, description } = parameters;

  if (!group || !ou) {
    throw new Error('create_group action requires group and ou parameters.');
  }

  addLog(log, `Creating group "${group}" in ${ou}`);
  const args = ['samba-tool', 'group', 'add', group, `--groupou=${normalizeOu(ou)}`];

  if (scope) {
    args.push(`--group-scope=${scope}`);
  }
  if (description) {
    args.push(`--description=${description}`);
  }

  const result = await runDcCommand(args);
  if (result.stdout.trim()) addLog(log, result.stdout.trim());
  if (result.stderr.trim()) addLog(log, result.stderr.trim());
}

async function resetPassword(parameters, log) {
  const { username, new_password: newPassword, force_password_change: forceChange } = parameters;

  if (!username || !newPassword) {
    throw new Error('reset_password action requires username and new_password parameters.');
  }

  const { password: passwordToUse, generated } = ensureStrongPassword(newPassword);

  addLog(log, `Resetting password for "${username}".`);
  const args = ['samba-tool', 'user', 'setpassword', username, `--newpassword=${passwordToUse}`];
  if (forceChange) {
    args.push('--must-change-at-next-login');
  }

  const result = await runDcCommand(args);
  if (result.stdout.trim()) addLog(log, result.stdout.trim());
  if (result.stderr.trim()) addLog(log, result.stderr.trim());

  if (generated) {
    addLog(log, `Generated new secure password for "${username}": ${passwordToUse}`);
  } else {
    addLog(log, `Password reset completed for "${username}".`);
  }
}

async function applyGpo(parameters, log) {
  const { gpo_name: gpoName, target_ous: targetOus = [], policy_settings: policySettings = {}, enforcement } =
    parameters;

  if (!gpoName || !Array.isArray(targetOus) || !targetOus.length) {
    throw new Error('apply_gpo action requires gpo_name and a non-empty target_ous list.');
  }

  addLog(log, `Ensuring GPO "${gpoName}" exists.`);
  try {
    const createResult = await runDcCommand(['samba-tool', 'gpo', 'create', gpoName]);
    if (createResult.stdout.trim()) addLog(log, createResult.stdout.trim());
    if (createResult.stderr.trim()) addLog(log, createResult.stderr.trim());
  } catch (error) {
    const stderr = error.stderr || '';
    const message = error.message || '';
    const existsAlready = /already exist/i.test(stderr) || /already exist/i.test(message);

    if (existsAlready) {
      addLog(log, `GPO "${gpoName}" already exists. Continuing without creation.`);
    } else {
      throw error;
    }
  }

  const gpoIdentifier = await resolveGpoIdentifier(gpoName, log);

  for (const target of targetOus) {
    addLog(log, `Linking GPO "${gpoName}" to ${target}.`);
    const linkArgs = ['samba-tool', 'gpo', 'setlink', target, gpoIdentifier];
    if (enforcement && enforcement !== 'Disabled') {
      if (enforcement === 'Enforced') {
        linkArgs.push('--enforced');
      } else if (enforcement === 'Enabled') {
        linkArgs.push('--enabled');
      }
    }
    const linkResult = await runDcCommand(linkArgs);
    if (linkResult.stdout.trim()) addLog(log, linkResult.stdout.trim());
    if (linkResult.stderr.trim()) addLog(log, linkResult.stderr.trim());
  }

  const settingKeys = Object.keys(policySettings || {});
  if (settingKeys.length) {
    addLog(
      log,
      `Policy settings requested for "${gpoName}": ${settingKeys
        .map((key) => `${key}=${policySettings[key]}`)
        .join(', ')}`
    );
    addLog(log, 'NOTE: Policy setting application is not yet automated in this sandbox.');
  }
}

async function resolveGpoIdentifier(gpoName, log) {
  try {
    const result = await runDcCommand(['samba-tool', 'gpo', 'show', gpoName]);
    const guidMatch = result.stdout.match(/\{[0-9a-fA-F-]{36}\}/);
    if (guidMatch) {
      const guid = guidMatch[0];
      addLog(log, `Resolved GPO "${gpoName}" to GUID ${guid}.`);
      return guid;
    }
  } catch (error) {
    addLog(log, `Warning: unable to resolve GUID for GPO "${gpoName}" (${error.stderr?.trim() || error.message}).`);
  }
  return gpoName;
}

export const actionHandlers = {
  create_user: createUser,
  add_user_to_group: addUserToGroup,
  remove_user_from_group: removeUserFromGroup,
  create_group: createGroup,
  apply_gpo: applyGpo,
  reset_password: resetPassword
};
