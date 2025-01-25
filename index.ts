import { randomUUID } from "crypto";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

/**
 * A class that represents a Lua module
 */
class LuaModule {
  identifier: string; // Lua path used in `require`
  path: string; // Absolute file path
  uniqueIdentifier: string;
  content: string;

  constructor(identifier: string, path: string, content: string) {
    this.identifier = identifier; // Use Lua path
    this.path = path;
    this.content = content;
    this.uniqueIdentifier = randomUUID();
  }
}

/**
 * A class that represents a Lua bundle
 */
class LuaBundle {
  modules: LuaModule[] = [];
  mainFile: string;
  baseDir: string;

  constructor(mainFile: string, baseDir?: string) {
    if (!existsSync(mainFile)) {
      throw new Error("Main file does not exist");
    }
    this.mainFile = mainFile;
    this.baseDir = baseDir || "./";
  }

  resolveRequire(value: string): string | null {
    const c1 = resolve(this.baseDir, ...value.split(".")) + ".lua";
    const c2 = resolve(this.baseDir, ...value.split(".")) + ".luau";
    if (existsSync(c1)) return c1;
    if (existsSync(c2)) return c2;
    return null;
  }

  getRequires(value: string): { luaPath: string; resolvedPath: string }[] {
    const requires: { luaPath: string; resolvedPath: string }[] = [];
    const matches = value.match(/require\(["'].*?["']\)/gi); // Find all `require` calls
    matches?.forEach((v) => {
      const luaPath = v.replace(/require\(["'](.*?)["']\)/, "$1"); // Extract Lua path
      const resolvedPath = this.resolveRequire(luaPath);
      if (resolvedPath) {
        requires.push({ luaPath, resolvedPath });
        const moduleContent = readFileSync(resolvedPath).toString("utf8");
        requires.push(...this.getRequires(moduleContent)); // Recursively add dependencies
      }
    });
    return requires;
  }

  remapRequires(value: string): string {
    return value.replace(/require\(["'](.*?)["']\)/g, (_, value) => {
      const resolvedPath = this.resolveRequire(value);
      if (!resolvedPath) {
        throw new Error(`Module "${value}" not found`);
      }
      const module = this.modules.find((mod) => mod.path === resolvedPath);
      if (!module) {
        throw new Error(`Module "${value}" not found`);
      }
      return `require("${module.uniqueIdentifier}")`;
    });
  }

  bundle(): string {
    const main = readFileSync(this.mainFile).toString("utf8");
    const requiredFiles = this.getRequires(main);

    requiredFiles.forEach(({ luaPath, resolvedPath }) => {
      if (!this.modules.some((mod) => mod.identifier === luaPath)) {
        const content = readFileSync(resolvedPath).toString("utf8");
        this.modules.push(new LuaModule(luaPath, resolvedPath, content)); // Use Lua path as identifier
      }
    });

    const bundledCode = `
local modules = {}
local require = function(name)
  return modules[name]()
end
${this.modules
  .map(
    (module) =>
      `modules["${module.uniqueIdentifier}"] = function()\n${this.remapRequires(module.content)}\nend`,
  )
  .join("\n")}
${this.remapRequires(main)}
`;

    return bundledCode;
  }
}

// Example usage
// const bundler = new LuaBundle(
//   "/home/sk337/obscuraLua/ObscuraLuaObfuscator/src/cli.lua",
//   "/home/sk337/obscuraLua/ObscuraLuaObfuscator/src",
// );

const bundler = new LuaBundle("tlp/main.lua", "tlp");

try {
  const code = bundler.bundle();
  console.log(code);
} catch (error) {
  console.error("Error bundling Lua files:", error.message);
}
