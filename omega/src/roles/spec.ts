import type { Spec } from '../core/types.ts';
import { slugify } from '../core/util.ts';

/** JSON Schema handed to Claude Code's --json-schema for the product role. */
export const SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'slug', 'summary', 'requirements', 'acceptanceCriteria', 'module', 'outOfScope'],
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    summary: { type: 'string' },
    requirements: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: { id: { type: 'string' }, text: { type: 'string' } },
      },
    },
    module: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'exports'],
      properties: {
        path: { type: 'string' },
        exports: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'signature', 'description'],
            properties: { name: { type: 'string' }, signature: { type: 'string' }, description: { type: 'string' } },
          },
        },
      },
    },
    cli: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'usage', 'examples'],
      properties: { path: { type: 'string' }, usage: { type: 'string' }, examples: { type: 'array', items: { type: 'string' } } },
    },
    outOfScope: { type: 'array', items: { type: 'string' } },
  },
} as const;

export class SpecError extends Error {}

const str = (v: unknown, field: string, max = 2000): string => {
  if (typeof v !== 'string' || v.trim() === '') throw new SpecError(`spec.${field} must be a non-empty string`);
  if (v.length > max) throw new SpecError(`spec.${field} is too long`);
  return v.trim();
};

const strList = (v: unknown, field: string, maxItems = 20): string[] => {
  if (!Array.isArray(v)) throw new SpecError(`spec.${field} must be an array`);
  if (v.length > maxItems) throw new SpecError(`spec.${field} has more than ${maxItems} items`);
  return v.map((x, i) => str(x, `${field}[${i}]`, 500));
};

/**
 * Validate and normalise a spec, whoever produced it. The module/CLI paths are fixed
 * by OMEGA's project layout, because the role policies are written against them.
 */
export function validateSpec(raw: unknown): Spec {
  if (!raw || typeof raw !== 'object') throw new SpecError('spec must be an object');
  const r = raw as Record<string, unknown>;
  const acs = r.acceptanceCriteria;
  if (!Array.isArray(acs) || acs.length < 1 || acs.length > 12) throw new SpecError('spec needs 1–12 acceptance criteria');
  const seen = new Set<string>();
  const acceptanceCriteria = acs.map((ac, i) => {
    const a = ac as Record<string, unknown>;
    const id = str(a?.id, `acceptanceCriteria[${i}].id`, 10).toUpperCase();
    if (!/^AC\d{1,2}$/.test(id)) throw new SpecError(`acceptance criterion id "${id}" must look like AC1`);
    if (seen.has(id)) throw new SpecError(`duplicate acceptance criterion id ${id}`);
    seen.add(id);
    return { id, text: str(a.text, `acceptanceCriteria[${i}].text`, 600) };
  });
  const mod = r.module as Record<string, unknown> | undefined;
  if (!mod || !Array.isArray(mod.exports) || mod.exports.length < 1) throw new SpecError('spec.module.exports must list at least one export');
  const exports = (mod.exports as Record<string, unknown>[]).slice(0, 20).map((e, i) => {
    const name = str(e?.name, `module.exports[${i}].name`, 80);
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new SpecError(`export name "${name}" is not a valid identifier`);
    return { name, signature: str(e.signature, `module.exports[${i}].signature`, 300), description: str(e.description, `module.exports[${i}].description`, 500) };
  });
  const cliRaw = r.cli as Record<string, unknown> | undefined;
  const spec: Spec = {
    title: str(r.title, 'title', 120),
    slug: slugify(typeof r.slug === 'string' && r.slug ? r.slug : String(r.title)),
    summary: str(r.summary, 'summary', 1000),
    requirements: strList(r.requirements, 'requirements'),
    acceptanceCriteria,
    module: { path: 'src/index.js', exports },
    outOfScope: Array.isArray(r.outOfScope) ? strList(r.outOfScope, 'outOfScope') : [],
  };
  if (cliRaw && typeof cliRaw === 'object') {
    spec.cli = {
      path: 'src/cli.js',
      usage: str(cliRaw.usage, 'cli.usage', 300),
      examples: Array.isArray(cliRaw.examples) ? strList(cliRaw.examples, 'cli.examples', 10) : [],
    };
  }
  return spec;
}

export function specToMarkdown(spec: Spec): string {
  const lines = [
    `# ${spec.title}`,
    '',
    spec.summary,
    '',
    '## Requirements',
    ...spec.requirements.map((r) => `- ${r}`),
    '',
    '## Acceptance criteria',
    ...spec.acceptanceCriteria.map((a) => `- **${a.id}** — ${a.text}`),
    '',
    '## Interface',
    `Module \`${spec.module.path}\`:`,
    ...spec.module.exports.map((e) => `- \`${e.name}${e.signature.startsWith('(') ? '' : ': '}${e.signature}\` — ${e.description}`),
  ];
  if (spec.cli) lines.push('', `CLI \`${spec.cli.path}\`: \`${spec.cli.usage}\``, ...spec.cli.examples.map((x) => `- \`${x}\``));
  if (spec.outOfScope.length) lines.push('', '## Out of scope', ...spec.outOfScope.map((o) => `- ${o}`));
  return lines.join('\n') + '\n';
}
