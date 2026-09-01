/**
 * The Product Owner changed the model. This is what happens next, in order.
 *
 * The architecture is model-driven: the vocabulary, the entities and the names
 * all come from remy-sport-biz, and everything downstream is derived from them —
 * the drizzle schema, the migration, the seed, and four checks that each verify
 * one link of the chain.
 *
 * That chain existed and nothing stated it. The steps were scattered across two
 * commands — `ops biz`, `ops domain`, `db generate`, `db migrate-local` — with
 * the seed happening somewhere inside `prepare`, so the order was something you
 * knew or guessed. Guessing it wrong is quiet: skip the migration and the schema
 * describes tables the database does not have; skip the seed and the fixtures
 * reference vocabulary that no longer exists.
 *
 *   mise run model              run the chain
 *   mise run model -- --order   print it without doing any of it
 *
 * This is the LOCAL half. It ends with a migration applied to .wrangler/state
 * and a deployment still on the old shape — `deploy` carries it out, and it
 * provisions before it publishes so the schema lands before the code that
 * needs it.
 *
 * Stops at the first step that fails, because every step after one depends on it.
 */

interface Step {
  name: string
  why: string
  /** Interactive steps keep the terminal — drizzle asks about renames. */
  interactive?: boolean
  cmd: string[]
}

const CHAIN: Step[] = [
  {
    name: "biz",
    why: "fast-forward the PO's checkout — everything below reads from it",
    cmd: ["bun", "scripts/ops/biz.ts"],
  },
  {
    name: "domain",
    why: "copy names, vocabularies and entities in, verbatim; nothing is transformed",
    cmd: ["bun", "scripts/ops/domain.ts"],
  },
  {
    name: "generate",
    why: "the drizzle schema reads the model, so a vocabulary change is a schema change; prompts on renames, which is why it is not automatic",
    interactive: true,
    cmd: ["bun", "scripts/db.ts", "generate"],
  },
  {
    name: "migrate-local",
    why: "apply it here before anything reads the new shape",
    cmd: ["bun", "scripts/db.ts", "migrate-local"],
  },
  {
    name: "seed",
    why: "seed.sql is generated from the model, so it changes with it — and after the schema its rows target exists",
    cmd: ["bun", "scripts/lib/seed.ts"],
  },
  {
    name: "verify",
    why: "the four checks that each prove one link: the copies match upstream, every table the model names exists, the seed matches the model, and it can be applied to an empty database",
    cmd: ["bun", "scripts/check.ts"],
  },
]

if (process.argv.includes("--order")) {
  console.log("\nmise run model — when the Product Owner changes the model\n")
  const pad = Math.max(...CHAIN.map((s) => s.name.length))
  CHAIN.forEach((s, i) => console.log(`  ${i + 1}. ${s.name.padEnd(pad)}  ${s.why}`))
  console.log("")
  process.exit(0)
}

for (const [i, step] of CHAIN.entries()) {
  console.log(`\n── ${i + 1}/${CHAIN.length} ${step.name}`)
  const proc = Bun.spawnSync(step.cmd, {
    stdin: step.interactive ? "inherit" : "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  if (proc.exitCode !== 0) {
    console.error(
      `\nmodel: stopped at ${step.name}.\n` +
        `  Every step after this one reads what it produces, so running them now\n` +
        `  would build on something that did not happen.\n`,
    )
    process.exit(proc.exitCode ?? 1)
  }
}

console.log(
  "\nmodel: the model is in, the schema follows it, and the checks agree — HERE.\n\n" +
    "  A deployment still has the old shape. The migration this just wrote is applied\n" +
    "  to .wrangler/state and nowhere else, and `deploy` is what carries it out —\n" +
    "  it provisions before it publishes, so the schema lands before the code that\n" +
    "  needs it.\n\n" +
    "    mise run deploy -- --env staging\n" +
    "    mise run deploy -- --env production\n",
)
