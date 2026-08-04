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
    "generation preflight",
    "generation begin --library <library-root> --creation <creation-id> --request-stdin",
    "image_gen.imagegen",
    "generation finalize --library <library-root> --transaction <transaction-id> --result-stdin",
  ];

  let previous = -1;
  for (const marker of orderedMarkers) {
    const current = skill.indexOf(marker, previous + 1);
    assert.ok(current > previous, `${marker} must appear after the prior workflow step`);
    previous = current;
  }
});

test("happy path does not repeat read-only preflight or prompt verification", () => {
  assert.equal(skill.match(/generation preflight/g)?.length, 2);
  assert.doesNotMatch(skill, /capabilities --format json/);
  assert.doesNotMatch(skill, /library resolve --format json/);
  assert.doesNotMatch(skill, /recover list --library/);
  assert.doesNotMatch(skill, /asset inspect --library/);
  assert.equal(skill.match(/generation verify-prompt/g)?.length, 1);
  assert.equal(skill.match(/generation prepare/g)?.length, 1);
  assert.equal(skill.match(/generation mark-invocation-started/g)?.length, 1);
});

test("skill forbids unarchived and automatically retried generation", () => {
  assert.match(skill, /image_gen\.imagegen/);
  assert.match(skill, /retry/);
  assert.match(skill, /edit target/);
  assert.match(skill, /argv/);
  assert.match(skill, /Commit Marker/);
});

test("skill materializes and imports Session Images before generation", () => {
  assert.match(skill, /SESSION_IMAGE_NOT_MATERIALIZED/);
  assert.match(skill, /IMAGE_SOURCE_MISSING/);
  assert.match(skill, /IMAGE_SOURCE_UNREADABLE/);
  assert.match(skill, /任一 inspection 失败时整体停止/);
  assert.match(skill, /比较 expected 与 actual `assetSha256`/);
  assert.match(skill, /不单独调用 `asset import`/);
  assert.match(skill, /不设置默认 role/);
  assert.match(skill, /保存这次 preflight 的完整 snapshot 与 canonical `libraryRoot`/);
});

test("skill keeps workflow telemetry truthful and inspection off the commit path", () => {
  assert.match(skill, /Codex UI duration 不可观测时不发送 `nonModelOverheadMs`/);
  assert.match(skill, /最终 SLO 保持 `unknown`/);
  assert.match(skill, /不从 repository spans 推测/);
  assert.match(skill, /下一动作必须启动 `generation finalize`/);
  assert.match(skill, /不在 commit 前重复调用 `view_image`/);
  assert.match(skill, /才在 commit 后读取 Archive Output/);
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
    [1, 2, 3, 4],
  );
  for (const entry of evals.evals) {
    assert.ok(entry.prompt.includes("$generate-and-archive"));
    assert.ok(entry.expectations.length >= 4);
  }
});
