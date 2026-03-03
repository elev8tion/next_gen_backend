import type { BlueprintModule } from "./types";

export class DependencyResolver {
  resolve(modules: BlueprintModule[]): BlueprintModule[] {
    const moduleMap = new Map<string, BlueprintModule>();
    for (const m of modules) {
      moduleMap.set(m.module.key, m);
    }

    // Build adjacency list: module -> modules it depends on
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // dep -> modules that depend on it

    for (const m of modules) {
      const key = m.module.key;
      if (!inDegree.has(key)) inDegree.set(key, 0);

      for (const dep of m.dependencies || []) {
        // Skip optional deps that aren't in the pack
        if (dep.optional && !moduleMap.has(dep.module_key)) continue;

        if (!moduleMap.has(dep.module_key)) {
          throw new Error(
            `Module "${key}" requires "${dep.module_key}" which is not in the pack`
          );
        }

        // Semver check: for ^X.Y.Z, major must match
        this.checkVersion(key, dep.module_key, dep.version, moduleMap);

        inDegree.set(key, (inDegree.get(key) || 0) + 1);
        if (!dependents.has(dep.module_key)) {
          dependents.set(dep.module_key, []);
        }
        dependents.get(dep.module_key)!.push(key);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [key, deg] of inDegree) {
      if (deg === 0) queue.push(key);
    }

    const sorted: BlueprintModule[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(moduleMap.get(current)!);

      for (const dep of dependents.get(current) || []) {
        const newDeg = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    if (sorted.length !== modules.length) {
      const remaining = modules
        .filter((m) => !sorted.some((s) => s.module.key === m.module.key))
        .map((m) => m.module.key);
      throw new Error(
        `Circular dependency detected among: ${remaining.join(", ")}`
      );
    }

    return sorted;
  }

  private checkVersion(
    requirer: string,
    depKey: string,
    versionConstraint: string,
    moduleMap: Map<string, BlueprintModule>
  ) {
    const dep = moduleMap.get(depKey);
    if (!dep) return;

    const constraint = versionConstraint.replace(/^\^/, "");
    const [reqMajor] = constraint.split(".").map(Number);
    const [actMajor, actMinor, actPatch] = dep.module.version
      .split(".")
      .map(Number);
    const [, reqMinor, reqPatch] = constraint.split(".").map(Number);

    if (actMajor !== reqMajor) {
      throw new Error(
        `Module "${requirer}" requires ${depKey}@${versionConstraint} but found ${dep.module.version} (major mismatch)`
      );
    }

    if (
      actMajor === reqMajor &&
      (actMinor < reqMinor || (actMinor === reqMinor && actPatch < reqPatch))
    ) {
      throw new Error(
        `Module "${requirer}" requires ${depKey}@${versionConstraint} but found ${dep.module.version} (version too low)`
      );
    }
  }
}
