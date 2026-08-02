import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillRoot = path.join(repositoryRoot, ".agents/skills/generate-and-archive");
const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");

test("skill metadata is lean and explicit-only", () => {
  assert.match(skill, /^---\nname: generate-and-archive\n/);
  assert.match(skill, /description: .*explicitly invokes this skill/);
  assert.ok(skill.split("\n").length < 500);

  const metadata = readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
  assert.match(metadata, /allow_implicit_invocation: false/);
});

test("workflow preserves the required generation transaction order", () => {
  const orderedMarkers = [
    "capabilities --format json",
    "library resolve --format json",
    "generation prepare",
    "generation mark-invocation-started",
    "image_gen.imagegen",
    "generation capture",
    "generation complete",
    "generation commit",
  ];

  let previous = -1;
  for (const marker of orderedMarkers) {
    const current = skill.indexOf(marker, previous + 1);
    assert.ok(current > previous, `${marker} must appear after the prior workflow step`);
    previous = current;
  }
});

test("skill forbids unarchived and automatically retried generation", () => {
  assert.match(skill, /image_gen\.imagegen/);
  assert.match(skill, /retry/);
  assert.match(skill, /edit target/);
  assert.match(skill, /argv/);
  assert.match(skill, /Commit Marker/);
});

test("all referenced guidance files exist and describe their hard boundary", () => {
  const references = {
    "cli-contract.md": ["--request-stdin", "--result-stdin", "--error-stdin"],
    "prompt-policy.md": ["Material Change Gate", "`other`", "`guidance`"],
    "recovery.md": ["invocation_started", "outcomeKnown: false", "recover finalize-interrupted"],
  };

  for (const [fileName, markers] of Object.entries(references)) {
    const content = readFileSync(path.join(skillRoot, "references", fileName), "utf8");
    for (const marker of markers) {
      assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("skill evals cover variants, references, and conservative recovery", () => {
  const evals = JSON.parse(readFileSync(path.join(skillRoot, "evals/evals.json"), "utf8"));
  assert.equal(evals.skill_name, "generate-and-archive");
  assert.deepEqual(
    evals.evals.map((entry) => entry.id),
    [1, 2, 3],
  );
  for (const entry of evals.evals) {
    assert.ok(entry.prompt.includes("$generate-and-archive"));
    assert.ok(entry.expectations.length >= 4);
  }
});
