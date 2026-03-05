#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const configPath = path.join("tools", "tests", "tsconfig.retrieval-tests.json");
const builtTestPath = path.join(".tmp-tests", "tools", "tests", "retrieval.test.js");

execSync(`npx tsc -p ${configPath}`, { cwd: root, stdio: "inherit", shell: "/bin/sh" });
execSync(`node ${builtTestPath}`, { cwd: root, stdio: "inherit", shell: "/bin/sh" });
