const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function readText(relativePath) {
  const absPath = path.join(projectRoot, relativePath);
  return fs.readFileSync(absPath, "utf8");
}

function fail(message) {
  console.error(`❌ 类型契约校验失败：${message}`);
  process.exit(1);
}

function extractTsUnionValues(source, typeName) {
  const blockMatch = source.match(
    new RegExp(`export\\s+type\\s+${typeName}\\s*=([\\s\\S]*?);`),
  );
  if (!blockMatch) {
    fail(`在 src/types/index.ts 中找不到 ${typeName} 类型定义`);
  }

  const values = [...blockMatch[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  if (values.length === 0) {
    fail(`${typeName} 类型未提取到任何字符串字面量`);
  }
  return values;
}

function extractRustEnumVariants(source, enumName) {
  const enumMatch = source.match(
    new RegExp(`pub\\s+enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!enumMatch) {
    fail(`在 src-tauri/src/state/mod.rs 中找不到 ${enumName} 枚举定义`);
  }

  const variants = [...enumMatch[1].matchAll(/\n\s*([A-Z][A-Za-z0-9_]*)\s*=\s*-?\d+,/g)].map(
    (item) => item[1],
  );

  if (variants.length === 0) {
    fail(`${enumName} 枚举未提取到任何成员`);
  }

  return variants.map((name) => name.toLowerCase());
}

function extractTsInterfaceKeys(source, interfaceName) {
  const blockMatch = source.match(
    new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!blockMatch) {
    fail(`在 src/types/index.ts 中找不到 ${interfaceName} 接口定义`);
  }

  const keys = [...blockMatch[1].matchAll(/^\s*([a-zA-Z_][\w]*)\??\s*:/gm)].map(
    (item) => item[1],
  );

  if (keys.length === 0) {
    fail(`${interfaceName} 接口未提取到字段`);
  }

  return keys;
}

function extractRustStructKeys(source, structName) {
  const blockMatch = source.match(
    new RegExp(`pub\\s+struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!blockMatch) {
    fail(`在 src-tauri/src/state/mod.rs 中找不到 ${structName} 结构体定义`);
  }

  const keys = [...blockMatch[1].matchAll(/pub\s+([a-zA-Z_][\w]*)\s*:/g)].map(
    (item) => item[1],
  );

  if (keys.length === 0) {
    fail(`${structName} 结构体未提取到字段`);
  }

  return keys;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sortedUnique(list) {
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
}

function main() {
  const tsTypes = readText("src/types/index.ts");
  const rustState = readText("src-tauri/src/state/mod.rs");

  const tsPhase = extractTsUnionValues(tsTypes, "Phase");
  const rustPhase = extractRustEnumVariants(rustState, "Phase");

  if (!arraysEqual(tsPhase, rustPhase)) {
    fail(
      `Phase 不一致。frontend=${JSON.stringify(tsPhase)} backend=${JSON.stringify(rustPhase)}`,
    );
  }

  const tsDiagKeys = sortedUnique(extractTsInterfaceKeys(tsTypes, "SessionDiagnostics"));
  const rustDiagKeys = sortedUnique(extractRustStructKeys(rustState, "SessionDiagnostics"));

  if (!arraysEqual(tsDiagKeys, rustDiagKeys)) {
    fail(
      `SessionDiagnostics 字段不一致。frontend=${JSON.stringify(
        tsDiagKeys,
      )} backend=${JSON.stringify(rustDiagKeys)}`,
    );
  }

  const tsStateKeys = sortedUnique(extractTsInterfaceKeys(tsTypes, "StateMachine"));
  const rustStateKeys = sortedUnique(extractRustStructKeys(rustState, "StateMachine"));

  if (!arraysEqual(tsStateKeys, rustStateKeys)) {
    fail(
      `StateMachine 字段不一致。frontend=${JSON.stringify(
        tsStateKeys,
      )} backend=${JSON.stringify(rustStateKeys)}`,
    );
  }

  console.log("✅ 类型契约校验通过：Phase、SessionDiagnostics、StateMachine 保持一致");
}

main();
