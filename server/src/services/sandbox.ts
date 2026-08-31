import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/**
 * Validate configured image references before they can become positional Docker
 * arguments. Images are operator configuration, never model input, but rejecting
 * option-like or delimiter-bearing values protects against accidental unsafe env
 * configuration as well.
 */
export function validateSandboxImage(value: string): string {
  const image = value.trim();
  if (
    !image ||
    image.length > 255 ||
    image.startsWith('-') ||
    image.includes('..') ||
    image.includes('://') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(image)
  ) {
    throw new Error(`Unsafe sandbox image reference: ${JSON.stringify(value)}`);
  }

  if (image.includes('@') && !/@sha256:[a-fA-F0-9]{64}$/.test(image)) {
    throw new Error('Digest-pinned sandbox images must use @sha256:<64 hex characters>.');
  }

  return image;
}

const NODE_IMAGE = validateSandboxImage(
  process.env.AGENT_OS_NODE_SANDBOX_IMAGE?.trim() || 'node:24-bookworm-slim'
);
const PYTHON_IMAGE = validateSandboxImage(
  process.env.AGENT_OS_PYTHON_SANDBOX_IMAGE?.trim() || 'python:3.12-slim'
);

export const SANDBOX_TASKS = {
  'node-lock': {
    image: NODE_IMAGE,
    command:
      'npm install --package-lock-only --ignore-scripts --no-audit --no-fund --package-lock',
    description: 'Resolve a validated npm package-lock.json without running package scripts',
    runtime: 'node',
    kind: 'lock',
  },
  'node-test': {
    image: NODE_IMAGE,
    command: 'npm test',
    description: 'Run the project test script',
    runtime: 'node',
    kind: 'verify',
  },
  'node-build': {
    image: NODE_IMAGE,
    command: 'npm run build',
    description: 'Run the project production build script',
    runtime: 'node',
    kind: 'verify',
  },
  'node-lint': {
    image: NODE_IMAGE,
    command: 'npm run lint',
    description: 'Run the project lint script',
    runtime: 'node',
    kind: 'verify',
  },
  'node-typecheck': {
    image: NODE_IMAGE,
    command: 'npm run typecheck',
    description: 'Run the project typecheck script',
    runtime: 'node',
    kind: 'verify',
  },
  'python-test': {
    image: PYTHON_IMAGE,
    command: 'python -m pytest -q',
    description: 'Run the Python test suite',
    runtime: 'python',
    kind: 'verify',
  },
} as const;

export type SandboxTask = keyof typeof SANDBOX_TASKS;

type SandboxTaskSpec = (typeof SANDBOX_TASKS)[SandboxTask];

export interface SandboxResult {
  task: SandboxTask;
  passed: boolean;
  blocked: boolean;
  exitCode: number | null;
  image: string;
  output: string;
}

export interface NodeLockValidation {
  lockfileVersion: 2 | 3;
  registryArtifacts: number;
  packageEntries: number;
}

interface NodeProjectPolicy {
  dependencyCount: number;
  hasLockfile: boolean;
}

const MAX_SOURCE_FILES = 10_000;
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_LOCKFILE_BYTES = 12 * 1024 * 1024;
const MAX_LOCKFILE_NODES = 50_000;
const MAX_DEPENDENCIES = 1_000;
const REGISTRY_HOST = 'registry.npmjs.org';
const IGNORED_SOURCE_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
]);

export function normalizeSandboxTask(value: unknown): SandboxTask | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return Object.prototype.hasOwnProperty.call(SANDBOX_TASKS, candidate)
    ? (candidate as SandboxTask)
    : null;
}

export function getSandboxTaskSpec(task: SandboxTask): SandboxTaskSpec {
  return SANDBOX_TASKS[task];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dependencySpecIsRemoteOrLocal(value: string): boolean {
  const spec = value.trim().toLowerCase();
  if (spec.startsWith('npm:')) return false;
  return (
    /^(?:file|link|workspace|git|git\+|github|gitlab|bitbucket|http|https|ssh):/.test(spec) ||
    spec.startsWith('git@') ||
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('\\\\') ||
    /^[a-z]:[\\/]/.test(spec) ||
    spec.includes('/') ||
    spec.includes('\\')
  );
}

/**
 * Accept registry package declarations only. Resolution still happens in an
 * isolated container and the resulting lockfile is validated before it can be
 * written back to the workspace.
 */
export function validateNodeManifest(value: unknown): number {
  const manifest = record(value);
  if (Object.keys(manifest).length === 0) {
    throw new Error('package.json must contain one JSON object.');
  }

  if (manifest.workspaces !== undefined) {
    throw new Error('Workspace/link dependency graphs are not supported in autonomous mode.');
  }
  if (
    typeof manifest.packageManager === 'string' &&
    !/^npm@\d+(?:\.\d+){0,2}(?:[-+][A-Za-z0-9.-]+)?$/.test(manifest.packageManager)
  ) {
    throw new Error('Autonomous Node projects must use npm as the package manager.');
  }

  let dependencyCount = 0;
  for (const sectionName of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const sectionValue = manifest[sectionName];
    if (sectionValue === undefined) continue;
    if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
      throw new Error(`${sectionName} must be a JSON object.`);
    }
    const section = sectionValue as Record<string, unknown>;

    for (const [name, rawSpec] of Object.entries(section)) {
      dependencyCount++;
      if (dependencyCount > MAX_DEPENDENCIES) {
        throw new Error(`package.json exceeds the ${MAX_DEPENDENCIES}-dependency safety limit.`);
      }
      if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        throw new Error(`Unsupported npm package name: ${JSON.stringify(name)}.`);
      }
      if (
        typeof rawSpec !== 'string' ||
        !rawSpec.trim() ||
        rawSpec.length > 200 ||
        /[\r\n\0]/.test(rawSpec)
      ) {
        throw new Error(`Invalid version spec for npm package ${name}.`);
      }
      if (dependencySpecIsRemoteOrLocal(rawSpec)) {
        throw new Error(
          `Dependency ${name} uses a URL, Git, workspace, or local-path spec. ` +
            'Only npm-registry package specs are allowed in autonomous mode.'
        );
      }
    }
  }

  return dependencyCount;
}

function validateRegistryTarball(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid package-lock resolved URL: ${JSON.stringify(value)}.`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== REGISTRY_HOST ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith('.tgz')
  ) {
    throw new Error(
      `package-lock.json may resolve tarballs only from https://${REGISTRY_HOST}/.`
    );
  }
}

/**
 * Validate every resolved artifact in an npm v2/v3 lockfile. Git, arbitrary
 * hosts, clear-text URLs, link packages, and artifacts without SHA-512 integrity
 * are rejected before a networked resolver or installer can run.
 */
export function validateNodeLockfile(value: unknown): NodeLockValidation {
  const lockfile = record(value);
  const version = Number(lockfile.lockfileVersion);
  if (version !== 2 && version !== 3) {
    throw new Error('package-lock.json must use lockfileVersion 2 or 3.');
  }
  const packages = record(lockfile.packages);
  const packageEntries = Object.keys(packages).length;
  if (packageEntries === 0 || !Object.prototype.hasOwnProperty.call(packages, '')) {
    throw new Error('package-lock.json must contain a root packages entry.');
  }
  if (packageEntries > MAX_DEPENDENCIES * 20) {
    throw new Error('package-lock.json contains too many package entries.');
  }

  let visited = 0;
  let registryArtifacts = 0;
  const stack: unknown[] = [lockfile];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    visited++;
    if (visited > MAX_LOCKFILE_NODES) {
      throw new Error('package-lock.json exceeds the structural safety limit.');
    }

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    const object = current as Record<string, unknown>;
    if (object.link === true) {
      throw new Error('Linked packages are not allowed in autonomous package-lock files.');
    }
    if (object.resolved !== undefined) {
      if (typeof object.resolved !== 'string') {
        throw new Error('Every package-lock resolved field must be a string.');
      }
      validateRegistryTarball(object.resolved);
      if (
        typeof object.integrity !== 'string' ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(object.integrity)
      ) {
        throw new Error('Every resolved npm artifact must have SHA-512 integrity metadata.');
      }
      registryArtifacts++;
    }
    stack.push(...Object.values(object));
  }

  if (packageEntries > 1 && registryArtifacts === 0) {
    throw new Error('package-lock.json contains dependencies but no validated registry artifacts.');
  }

  return {
    lockfileVersion: version,
    registryArtifacts,
    packageEntries,
  };
}

function parseJsonFile(filePath: string, maxBytes: number): unknown {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${path.basename(filePath)} must be a regular file.`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`${path.basename(filePath)} exceeds the sandbox size limit.`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `${path.basename(filePath)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function inspectNodeProject(sourceDirectory: string): NodeProjectPolicy {
  const packagePath = path.join(sourceDirectory, 'package.json');
  if (!fs.existsSync(packagePath)) return { dependencyCount: 0, hasLockfile: false };
  const dependencyCount = validateNodeManifest(parseJsonFile(packagePath, MAX_SINGLE_FILE_BYTES));
  const lockPath = path.join(sourceDirectory, 'package-lock.json');
  const hasLockfile = fs.existsSync(lockPath);
  if (hasLockfile) {
    validateNodeLockfile(parseJsonFile(lockPath, MAX_LOCKFILE_BYTES));
  }
  return { dependencyCount, hasLockfile };
}

function sensitiveSourceFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const basename = path.posix.basename(normalized);
  if (['.env.example', '.env.sample', '.env.template'].includes(basename)) return false;
  return (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename === '.npmrc' ||
    basename === '.yarnrc' ||
    basename === '.netrc' ||
    basename === '.git-credentials' ||
    basename === 'id_rsa' ||
    basename === 'id_ed25519' ||
    basename === 'credentials.json' ||
    /^service-account.*\.json$/.test(basename) ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(basename)
  );
}

/**
 * Copy a source-only snapshot for Docker. Generated dependency/build folders are
 * omitted; symlinks, special files, secret-bearing filenames, and oversized
 * trees are rejected. The snapshot is safe to expose to the temporary resolver.
 */
export function createSandboxSnapshot(
  sourceDirectory: string,
  options: { omitPackageLock?: boolean } = {}
): string {
  const source = fs.realpathSync(path.resolve(sourceDirectory));
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error('Sandbox source must be a real directory.');
  }

  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-sandbox-source-'));
  fs.chmodSync(snapshot, 0o755);
  let files = 0;
  let bytes = 0;

  const copyDirectory = (from: string, to: string, relativeRoot: string): void => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in sandbox source: ${relativeRoot}${entry.name}`);
      }
      if (entry.isDirectory() && IGNORED_SOURCE_DIRECTORIES.has(entry.name.toLowerCase())) {
        continue;
      }

      const sourcePath = path.join(from, entry.name);
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      if (options.omitPackageLock && relativePath.toLowerCase() === 'package-lock.json') {
        continue;
      }
      const destinationPath = path.join(to, entry.name);
      const stat = fs.lstatSync(sourcePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in sandbox source: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        fs.mkdirSync(destinationPath, { mode: 0o755 });
        copyDirectory(sourcePath, destinationPath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Special files are not allowed in sandbox source: ${relativePath}`);
      }
      if (sensitiveSourceFile(relativePath)) {
        throw new Error(
          `Sandbox source contains a credential-bearing filename (${relativePath}). ` +
            'Move secrets outside the autonomous workspace.'
        );
      }
      if (stat.size > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`Sandbox source file is too large: ${relativePath}`);
      }
      files++;
      bytes += stat.size;
      if (files > MAX_SOURCE_FILES || bytes > MAX_SOURCE_BYTES) {
        throw new Error('Sandbox source exceeds the file-count or total-size safety limit.');
      }
      fs.copyFileSync(sourcePath, destinationPath);
      fs.chmodSync(destinationPath, stat.mode & 0o111 ? 0o755 : 0o644);
    }
  };

  try {
    copyDirectory(source, snapshot, '');
    return snapshot;
  } catch (error) {
    fs.rmSync(snapshot, { recursive: true, force: true });
    throw error;
  }
}

function compactOutput(stdout: string, stderr: string): string {
  const combined = `${stdout}${stderr ? `${stdout ? '\n' : ''}${stderr}` : ''}`.trim();
  return (combined || '(completed with no output)').slice(0, 8000);
}

function dockerEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    PATHEXT: process.env.PATHEXT ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    WINDIR: process.env.WINDIR ?? '',
    HOME: process.env.HOME ?? '',
    USERPROFILE: process.env.USERPROFILE ?? '',
    DOCKER_HOST: process.env.DOCKER_HOST ?? '',
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT ?? '',
    DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH ?? '',
    DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY ?? '',
  };
}

function dockerAvailable(): { available: boolean; detail: string } {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: dockerEnvironment(),
  });

  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      detail: compactOutput(result.stdout ?? '', result.stderr ?? ''),
    };
  }
  return { available: true, detail: (result.stdout || '').trim() };
}

function imageAvailable(image: string): boolean {
  validateSandboxImage(image);
  const result = spawnSync('docker', ['image', 'inspect', image], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: dockerEnvironment(),
  });
  return !result.error && result.status === 0;
}

function validateContainerName(value: string): string {
  if (!/^agent-os-sandbox-[a-f0-9-]{8,64}$/.test(value)) {
    throw new Error('Sandbox container name is invalid.');
  }
  return value;
}

function validateVolumeName(value: string): string {
  if (!/^agent-os-deps-[a-f0-9-]{8,64}$/.test(value)) {
    throw new Error('Sandbox volume name is invalid.');
  }
  return value;
}

function newContainerName(): string {
  return validateContainerName(`agent-os-sandbox-${randomUUID()}`);
}

function newVolumeName(): string {
  return validateVolumeName(`agent-os-deps-${randomUUID()}`);
}

function removeContainer(containerName: string): void {
  spawnSync('docker', ['rm', '-f', validateContainerName(containerName)], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: dockerEnvironment(),
  });
}

function removeVolume(volumeName: string): void {
  spawnSync('docker', ['volume', 'rm', '-f', validateVolumeName(volumeName)], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: dockerEnvironment(),
  });
}

function validateMountSource(sourceDirectory: string): string {
  const source = path.resolve(sourceDirectory);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error('Sandbox source directory does not exist.');
  }
  if (source.includes(',') || /[\r\n\0]/.test(source)) {
    throw new Error('Sandbox source path contains unsupported characters.');
  }
  return source;
}

function commonRestrictedRunArgs(
  containerName: string,
  network: 'none' | 'bridge',
  user = '65532:65532',
  memory = '1024m',
  cpus = '1'
): string[] {
  return [
    'run',
    '--rm',
    '--name',
    validateContainerName(containerName),
    '--pull=never',
    `--network=${network}`,
    '--read-only',
    '--user',
    user,
    '--cap-drop=ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '128',
    '--memory',
    memory,
    '--memory-swap',
    memory,
    '--cpus',
    cpus,
    '--ipc',
    'none',
    '--ulimit',
    'nofile=1024:1024',
    '--stop-timeout',
    '1',
    '--log-driver',
    'none',
    '--init',
  ];
}

function nodeEnvironmentArgs(offline: boolean): string[] {
  return [
    '--env',
    'HOME=/tmp',
    '--env',
    'npm_config_cache=/tmp/npm-cache',
    '--env',
    'npm_config_userconfig=/dev/null',
    '--env',
    `npm_config_registry=https://${REGISTRY_HOST}/`,
    '--env',
    'npm_config_audit=false',
    '--env',
    'npm_config_fund=false',
    '--env',
    'npm_config_update_notifier=false',
    '--env',
    `npm_config_offline=${offline ? 'true' : 'false'}`,
    '--env',
    'NO_COLOR=1',
  ];
}

/**
 * Build a fixed no-network Docker invocation for a dependency-free project.
 * No model-supplied command is ever interpolated.
 */
export function buildDockerArgs(
  sourceDirectory: string,
  task: SandboxTask,
  containerName = newContainerName()
): string[] {
  const source = validateMountSource(sourceDirectory);
  const spec = SANDBOX_TASKS[task];
  if (spec.kind !== 'verify') {
    throw new Error('Lockfile resolution uses the dedicated controlled resolver.');
  }
  const image = validateSandboxImage(spec.image);
  const fixedCommand = `cp -R --no-preserve=ownership /source/. /workspace/ && ${spec.command}`;

  return [
    ...commonRestrictedRunArgs(containerName, 'none'),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=128m,uid=65532,gid=65532,mode=1770',
    '--tmpfs',
    '/workspace:rw,exec,nosuid,nodev,size=1024m,uid=65532,gid=65532,mode=1770',
    '--mount',
    `type=bind,source=${source},target=/source,readonly`,
    '--workdir',
    '/workspace',
    ...nodeEnvironmentArgs(true),
    '--hostname',
    'agent-os-sandbox',
    image,
    'sh',
    '-lc',
    fixedCommand,
  ];
}

export function buildDockerVolumeInitArgs(
  volumeName: string,
  image = NODE_IMAGE,
  containerName = newContainerName()
): string[] {
  const volume = validateVolumeName(volumeName);
  return [
    ...commonRestrictedRunArgs(containerName, 'none', '0:0', '128m', '0.25'),
    '--cap-add=CHOWN',
    '--mount',
    `type=volume,source=${volume},target=/workspace`,
    '--workdir',
    '/workspace',
    validateSandboxImage(image),
    'sh',
    '-lc',
    'chown 65532:65532 /workspace && chmod 0700 /workspace',
  ];
}

export function buildDockerLockArgs(
  sourceDirectory: string,
  volumeName: string,
  containerName = newContainerName()
): string[] {
  const source = validateMountSource(sourceDirectory);
  const volume = validateVolumeName(volumeName);
  const spec = SANDBOX_TASKS['node-lock'];
  return [
    ...commonRestrictedRunArgs(containerName, 'bridge'),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=256m,uid=65532,gid=65532,mode=1770',
    '--mount',
    `type=bind,source=${source},target=/source,readonly`,
    '--mount',
    `type=volume,source=${volume},target=/workspace`,
    '--workdir',
    '/workspace',
    ...nodeEnvironmentArgs(false),
    '--hostname',
    'agent-os-resolver',
    validateSandboxImage(spec.image),
    'sh',
    '-lc',
    `cp -R --no-preserve=ownership /source/. /workspace/ && ${spec.command}`,
  ];
}

export function buildDockerDependencyArgs(
  sourceDirectory: string,
  volumeName: string,
  containerName = newContainerName()
): string[] {
  const source = validateMountSource(sourceDirectory);
  const volume = validateVolumeName(volumeName);
  return [
    ...commonRestrictedRunArgs(containerName, 'bridge'),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=512m,uid=65532,gid=65532,mode=1770',
    '--mount',
    `type=bind,source=${source},target=/source,readonly`,
    '--mount',
    `type=volume,source=${volume},target=/workspace`,
    '--workdir',
    '/workspace',
    ...nodeEnvironmentArgs(false),
    '--env',
    'npm_config_ignore_scripts=true',
    '--hostname',
    'agent-os-resolver',
    NODE_IMAGE,
    'sh',
    '-lc',
    'cp -R --no-preserve=ownership /source/. /workspace/ && npm ci --ignore-scripts --no-audit --no-fund --prefer-online',
  ];
}

export function buildDockerVolumeTaskArgs(
  volumeName: string,
  task: Exclude<SandboxTask, 'node-lock'>,
  containerName = newContainerName()
): string[] {
  const volume = validateVolumeName(volumeName);
  const spec = SANDBOX_TASKS[task];
  if (spec.runtime !== 'node' || spec.kind !== 'verify') {
    throw new Error('Dependency-volume execution is supported only for Node verification tasks.');
  }
  return [
    ...commonRestrictedRunArgs(containerName, 'none'),
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=512m,uid=65532,gid=65532,mode=1770',
    '--mount',
    `type=volume,source=${volume},target=/workspace`,
    '--workdir',
    '/workspace',
    ...nodeEnvironmentArgs(true),
    '--hostname',
    'agent-os-sandbox',
    validateSandboxImage(spec.image),
    'sh',
    '-lc',
    `npm rebuild --offline --no-audit --no-fund && ${spec.command}`,
  ];
}

function buildDockerReadLockArgs(
  volumeName: string,
  containerName = newContainerName()
): string[] {
  const volume = validateVolumeName(volumeName);
  return [
    ...commonRestrictedRunArgs(containerName, 'none'),
    '--mount',
    `type=volume,source=${volume},target=/workspace,readonly`,
    '--workdir',
    '/workspace',
    '--hostname',
    'agent-os-sandbox',
    NODE_IMAGE,
    'sh',
    '-lc',
    'cat package-lock.json',
  ];
}

function runDocker(
  args: string[],
  timeoutMs: number,
  maxBuffer = 8 * 1024 * 1024
): SpawnSyncReturns<string> {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer,
    env: dockerEnvironment(),
  });
}

function createVolume(volumeName: string): { passed: boolean; output: string } {
  const result = runDocker(['volume', 'create', validateVolumeName(volumeName)], 15_000);
  return {
    passed: !result.error && result.status === 0,
    output: result.error
      ? result.error.message
      : compactOutput(result.stdout ?? '', result.stderr ?? ''),
  };
}

function initializeVolume(volumeName: string): { passed: boolean; output: string } {
  const result = runDocker(buildDockerVolumeInitArgs(volumeName), 30_000);
  return {
    passed: !result.error && result.status === 0,
    output: result.error
      ? result.error.message
      : compactOutput(result.stdout ?? '', result.stderr ?? ''),
  };
}

function resultFromProcess(
  task: SandboxTask,
  image: string,
  result: SpawnSyncReturns<string>,
  containerName: string,
  prefix = ''
): SandboxResult {
  const output = compactOutput(result.stdout ?? '', result.stderr ?? '');
  if (result.error) {
    removeContainer(containerName);
    const code = (result.error as NodeJS.ErrnoException).code;
    const timedOut = code === 'ETIMEDOUT' || result.error.message.toLowerCase().includes('timed out');
    return {
      task,
      passed: false,
      blocked: false,
      exitCode: result.status,
      image,
      output: `${prefix}${timedOut ? 'Sandbox timeout' : 'Sandbox execution error'}: ${result.error.message}\n${output}`,
    };
  }
  return {
    task,
    passed: result.status === 0,
    blocked: false,
    exitCode: result.status,
    image,
    output: `${prefix}${output}`,
  };
}

function blockedResult(task: SandboxTask, message: string): SandboxResult {
  return {
    task,
    passed: false,
    blocked: true,
    exitCode: null,
    image: SANDBOX_TASKS[task].image,
    output: `Sandbox blocked: ${message}`,
  };
}

function atomicWriteLockfile(sourceDirectory: string, content: string): void {
  const target = path.join(sourceDirectory, 'package-lock.json');
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('Existing package-lock.json must be a regular file.');
    }
  }
  const temporary = path.join(sourceDirectory, `.agent-os-package-lock-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${content.trim()}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function runNodeLockTask(sourceDirectory: string, timeoutMs: number): SandboxResult {
  let snapshot = '';
  let volumeName = '';
  try {
    const packagePath = path.join(sourceDirectory, 'package.json');
    if (!fs.existsSync(packagePath)) {
      return blockedResult('node-lock', 'package.json is required before lockfile resolution.');
    }
    const dependencyCount = validateNodeManifest(
      parseJsonFile(packagePath, MAX_SINGLE_FILE_BYTES)
    );
    if (dependencyCount === 0) {
      return blockedResult('node-lock', 'package.json declares no dependencies to resolve.');
    }

    snapshot = createSandboxSnapshot(sourceDirectory, { omitPackageLock: true });
    volumeName = newVolumeName();
    const created = createVolume(volumeName);
    if (!created.passed) {
      return blockedResult('node-lock', `Docker volume creation failed. ${created.output}`);
    }
    const initialized = initializeVolume(volumeName);
    if (!initialized.passed) {
      return blockedResult('node-lock', `Docker dependency volume initialization failed. ${initialized.output}`);
    }

    const resolverName = newContainerName();
    const resolved = runDocker(buildDockerLockArgs(snapshot, volumeName, resolverName), timeoutMs);
    const resolverResult = resultFromProcess(
      'node-lock',
      NODE_IMAGE,
      resolved,
      resolverName,
      'LOCK RESOLUTION:\n'
    );
    if (!resolverResult.passed) return resolverResult;

    const readerName = newContainerName();
    const read = runDocker(
      buildDockerReadLockArgs(volumeName, readerName),
      30_000,
      MAX_LOCKFILE_BYTES + 1024 * 1024
    );
    if (read.error || read.status !== 0) {
      return resultFromProcess('node-lock', NODE_IMAGE, read, readerName, 'LOCKFILE READ:\n');
    }
    const lockText = String(read.stdout ?? '');
    if (Buffer.byteLength(lockText, 'utf8') > MAX_LOCKFILE_BYTES) {
      return blockedResult('node-lock', 'Generated package-lock.json exceeds the size limit.');
    }
    const validation = validateNodeLockfile(JSON.parse(lockText) as unknown);
    atomicWriteLockfile(sourceDirectory, lockText);
    return {
      task: 'node-lock',
      passed: true,
      blocked: false,
      exitCode: 0,
      image: NODE_IMAGE,
      output:
        `PASS: wrote validated package-lock.json (lockfile v${validation.lockfileVersion}; ` +
        `${validation.registryArtifacts} SHA-512 registry artifacts). Package scripts were not run.`,
    };
  } catch (error) {
    return blockedResult(
      'node-lock',
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    if (volumeName) removeVolume(volumeName);
    if (snapshot) fs.rmSync(snapshot, { recursive: true, force: true });
  }
}

function runNodeTaskWithDependencies(
  sourceDirectory: string,
  task: Exclude<SandboxTask, 'node-lock'>,
  timeoutMs: number
): SandboxResult {
  let snapshot = '';
  let volumeName = '';
  try {
    snapshot = createSandboxSnapshot(sourceDirectory);
    volumeName = newVolumeName();
    const created = createVolume(volumeName);
    if (!created.passed) {
      return blockedResult(task, `Docker volume creation failed. ${created.output}`);
    }
    const initialized = initializeVolume(volumeName);
    if (!initialized.passed) {
      return blockedResult(task, `Docker dependency volume initialization failed. ${initialized.output}`);
    }

    const installerName = newContainerName();
    const installed = runDocker(
      buildDockerDependencyArgs(snapshot, volumeName, installerName),
      timeoutMs
    );
    const installation = resultFromProcess(
      task,
      NODE_IMAGE,
      installed,
      installerName,
      'DEPENDENCY PREPARATION (scripts disabled):\n'
    );
    if (!installation.passed) return installation;

    const verifierName = newContainerName();
    const verified = runDocker(buildDockerVolumeTaskArgs(volumeName, task, verifierName), timeoutMs);
    return resultFromProcess(
      task,
      NODE_IMAGE,
      verified,
      verifierName,
      'DEPENDENCIES: locked install passed; lifecycle rebuild and task ran with network disabled.\n\n'
    );
  } catch (error) {
    return blockedResult(task, error instanceof Error ? error.message : String(error));
  } finally {
    if (volumeName) removeVolume(volumeName);
    if (snapshot) fs.rmSync(snapshot, { recursive: true, force: true });
  }
}

export function runSandboxTask(
  sourceDirectory: string,
  task: SandboxTask,
  timeoutMs = 180_000
): SandboxResult {
  const spec = SANDBOX_TASKS[task];
  const docker = dockerAvailable();
  if (!docker.available) {
    return blockedResult(task, `Docker is unavailable or not running. ${docker.detail}`);
  }
  if (!imageAvailable(spec.image)) {
    return blockedResult(
      task,
      `required image ${spec.image} is not present locally. ` +
        `Owner action: review and run "docker pull ${spec.image}" once. Automatic pulls are disabled.`
    );
  }

  const source = path.resolve(sourceDirectory);
  if (task === 'node-lock') {
    return runNodeLockTask(source, timeoutMs);
  }

  let policy: NodeProjectPolicy = { dependencyCount: 0, hasLockfile: false };
  try {
    if (spec.runtime === 'node') policy = inspectNodeProject(source);
  } catch (error) {
    return blockedResult(task, error instanceof Error ? error.message : String(error));
  }

  if (spec.runtime === 'node' && policy.dependencyCount > 0) {
    if (!policy.hasLockfile) {
      return blockedResult(
        task,
        'package.json declares dependencies but package-lock.json is missing. ' +
          'Run the fixed node-lock task, then retry verification.'
      );
    }
    return runNodeTaskWithDependencies(
      source,
      task as Exclude<SandboxTask, 'node-lock'>,
      timeoutMs
    );
  }

  let snapshot = '';
  const containerName = newContainerName();
  try {
    snapshot = createSandboxSnapshot(source);
    const args = buildDockerArgs(snapshot, task, containerName);
    const result = runDocker(args, timeoutMs);
    return resultFromProcess(task, spec.image, result, containerName);
  } catch (error) {
    return blockedResult(task, error instanceof Error ? error.message : String(error));
  } finally {
    if (snapshot) fs.rmSync(snapshot, { recursive: true, force: true });
  }
}

export function formatSandboxResult(result: SandboxResult): string {
  const state = result.blocked ? 'BLOCKED' : result.passed ? 'PASS' : 'FAIL';
  return [
    `${state}: ${result.task}`,
    `IMAGE: ${result.image}`,
    `EXIT: ${result.exitCode ?? 'not-run'}`,
    '',
    result.output,
  ].join('\n');
}
