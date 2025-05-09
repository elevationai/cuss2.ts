// Build script for Deno
console.log("Building CUSS2.ts with Deno...");

// Create dist directory if it doesn't exist
try {
  await Deno.mkdir("dist", { recursive: true });
} catch (e) {
  if (!(e instanceof Deno.errors.AlreadyExists)) {
    throw e;
  }
}

// Bundle the library
const { files, diagnostics } = await Deno.emit("./mod.ts", {
  bundle: "module",
  compilerOptions: {
    lib: ["deno.ns", "dom"],
  }
});

if (diagnostics.length > 0) {
  console.error("Compilation errors:");
  for (const diagnostic of diagnostics) {
    console.error(diagnostic.messageText);
  }
  Deno.exit(1);
}

// Write the bundled output to a file
await Deno.writeTextFile("dist/cuss2.js", files["deno:///bundle.js"]);

console.log("Build completed successfully!");